from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models import User
from app.schemas import UserCreate, UserOut, Token
from app.auth import hash_password, verify_password, create_access_token, get_current_user
from app.content.loader import assign_pilot_condition

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/signup", response_model=UserOut)
def signup(payload: UserCreate, db: DBSession = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "Email already registered")

    user = User(name=payload.name, email=payload.email, hashed_password=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    # HLD 6.3 / D-03: assign counterbalanced pair + condition at signup so
    # cohort spread is settled up front, not per-session.
    assignment = assign_pilot_condition(user.id)
    user.pilot_pair_id = assignment["pair_id"]
    user.pilot_condition_map = assignment["condition_map"]
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: DBSession = Depends(get_db)):
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(401, "Incorrect email or password")
    return Token(access_token=create_access_token(user.id))
