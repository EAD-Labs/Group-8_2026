from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session as DBSession

from app.config import settings
from app.database import get_db
from app.models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": user_id, "typ": "access", "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(token: str = Depends(oauth2_scheme), db: DBSession = Depends(get_db)) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials"
    )
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exc
        # A stream ticket is scoped to one SSE stream and must not be accepted
        # as a general access token. Tokens issued before `typ` existed have no
        # type and stay valid.
        if payload.get("typ") not in (None, "access"):
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exc
    return user


# --- SSE stream tickets ----------------------------------------------------
#
# `GET /classroom/{id}/stream` had no authentication and no ownership check, so
# any caller with a session id could read another learner's dialogue
# (PROJECT.md D3, HLD 11.3). The obvious fix — a `get_current_user` dependency
# — doesn't work directly: the browser's `EventSource` cannot send an
# `Authorization` header, and there is no polyfill in this stack.
#
# So the client first POSTs to `/classroom/{id}/stream-ticket` with its normal
# Bearer token and gets back a short-lived ticket, which it passes as a query
# parameter on the stream URL. The ticket is:
#
#   - scoped to one session id, so it grants nothing else;
#   - valid for 60 seconds, long enough to open a stream and to reconnect after
#     a drop, short enough that a URL captured in a proxy log or browser history
#     is worthless by the time anyone reads it;
#   - typed, so an access token cannot be used as a ticket or vice versa.
#
# It carries no personal data — a user id and a session id, both already opaque
# UUIDs — which is what makes a query parameter acceptable here at all.

STREAM_TICKET_TTL_SECONDS = 60
_STREAM_TICKET_TYPE = "stream_ticket"


def create_stream_ticket(user_id: str, session_id: str) -> str:
    payload = {
        "sub": user_id,
        "sid": session_id,
        "typ": _STREAM_TICKET_TYPE,
        "exp": datetime.utcnow() + timedelta(seconds=STREAM_TICKET_TTL_SECONDS),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_stream_ticket(ticket: str, session_id: str) -> str:
    """Returns the user id the ticket was issued to, or raises 401."""
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired stream ticket"
    )
    try:
        payload = jwt.decode(ticket, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        raise invalid
    if payload.get("typ") != _STREAM_TICKET_TYPE:
        raise invalid
    if payload.get("sid") != session_id:
        raise invalid
    user_id = payload.get("sub")
    if not user_id:
        raise invalid
    return user_id
