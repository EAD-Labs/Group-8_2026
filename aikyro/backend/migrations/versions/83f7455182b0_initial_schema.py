"""initial schema

The whole schema as one baseline migration. The app previously relied on
`Base.metadata.create_all` at startup, which is fine for SQLite dev and not fine
the moment PostgreSQL holds pilot data (PROJECT.md §4): there is no way to evolve
a column, and no record of what shape the data is in.

`create_all` now runs only when `env == "dev"`; everywhere else Alembic owns the
schema. Upgrade an existing dev database with `alembic stamp head` before the
first real migration, or it will try to create tables that already exist.

Revision ID: 83f7455182b0
Revises: 
Create Date: 2026-09-11 00:22:52.670266

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '83f7455182b0'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('email', sa.String(), nullable=False),
    sa.Column('hashed_password', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('pilot_pair_id', sa.String(), nullable=True),
    sa.Column('pilot_condition_map', sa.JSON(), nullable=True),
    sa.Column('total_points', sa.Integer(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_users_email'), ['email'], unique=True)

    op.create_table('verified_knowledge_records',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('concept_id', sa.String(), nullable=False),
    sa.Column('module_id', sa.String(), nullable=False),
    sa.Column('topic_name', sa.String(), nullable=True),
    sa.Column('verified_text', sa.Text(), nullable=False),
    sa.Column('structured', sa.JSON(), nullable=True),
    sa.Column('provenance', sa.JSON(), nullable=False),
    sa.Column('resolved_disagreements', sa.JSON(), nullable=False),
    sa.Column('confidence', sa.Float(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('verified_knowledge_records', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_verified_knowledge_records_concept_id'), ['concept_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_verified_knowledge_records_module_id'), ['module_id'], unique=False)

    op.create_table('badges',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('badge_code', sa.String(), nullable=False),
    sa.Column('awarded_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('badges', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_badges_badge_code'), ['badge_code'], unique=False)

    op.create_table('doubt_log_entries',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('concept_id', sa.String(), nullable=False),
    sa.Column('misconception_id', sa.String(), nullable=True),
    sa.Column('misconception', sa.String(), nullable=False),
    sa.Column('source', sa.String(), nullable=False),
    sa.Column('closed', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('closed_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('doubt_log_entries', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_doubt_log_entries_concept_id'), ['concept_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_doubt_log_entries_misconception_id'), ['misconception_id'], unique=False)

    op.create_table('learning_sessions',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('concept_id', sa.String(), nullable=False),
    sa.Column('module_id', sa.String(), nullable=False),
    sa.Column('verified_record_id', sa.String(), nullable=False),
    sa.Column('condition', sa.Enum('PLATFORM', 'PLAIN_CHAT', 'GENERAL_USE', name='conditiontype'), nullable=False),
    sa.Column('dialogue_mode', sa.Enum('FULL', 'REDUCED', name='dialoguemode'), nullable=False),
    sa.Column('time_budget_seconds', sa.Integer(), nullable=True),
    sa.Column('started_at', sa.DateTime(), nullable=False),
    sa.Column('completed_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['verified_record_id'], ['verified_knowledge_records.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('learning_sessions', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_learning_sessions_concept_id'), ['concept_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_learning_sessions_module_id'), ['module_id'], unique=False)

    op.create_table('mastery_records',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('concept_id', sa.String(), nullable=False),
    sa.Column('module_id', sa.String(), nullable=False),
    sa.Column('state', sa.Enum('NOT_STARTED', 'INTRODUCED', 'CHECKPOINT_PASSED', 'RETAINED', 'DEMOTED', name='conceptstate'), nullable=False),
    sa.Column('bloom_level_reached', sa.Enum('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYSE', name='bloomlevel'), nullable=True),
    sa.Column('next_retention_check', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('mastery_records', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_mastery_records_concept_id'), ['concept_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_mastery_records_module_id'), ['module_id'], unique=False)

    op.create_table('quiz_results',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('concept_id', sa.String(), nullable=False),
    sa.Column('quiz_type', sa.String(), nullable=False),
    sa.Column('linked_concept_id', sa.String(), nullable=True),
    sa.Column('prompt', sa.Text(), nullable=True),
    sa.Column('answer', sa.Text(), nullable=True),
    sa.Column('scheduled_for', sa.DateTime(), nullable=False),
    sa.Column('completed_at', sa.DateTime(), nullable=True),
    sa.Column('passed', sa.Boolean(), nullable=True),
    sa.Column('score', sa.Float(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('quiz_results', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_quiz_results_concept_id'), ['concept_id'], unique=False)

    op.create_table('baseline_messages',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('session_id', sa.String(), nullable=False),
    sa.Column('message_index', sa.Integer(), nullable=False),
    sa.Column('role', sa.String(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['session_id'], ['learning_sessions.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('baseline_messages', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_baseline_messages_session_id'), ['session_id'], unique=False)

    op.create_table('checkpoint_results',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('session_id', sa.String(), nullable=False),
    sa.Column('passed', sa.Boolean(), nullable=False),
    sa.Column('score', sa.Float(), nullable=False),
    sa.Column('answers', sa.JSON(), nullable=False),
    sa.Column('completed_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['session_id'], ['learning_sessions.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('session_id')
    )
    op.create_table('dialogue_turns',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('session_id', sa.String(), nullable=False),
    sa.Column('turn_index', sa.Integer(), nullable=False),
    sa.Column('speaker', sa.String(), nullable=False),
    sa.Column('turn_type', sa.String(), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('target_bloom_level', sa.Enum('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYSE', name='bloomlevel'), nullable=True),
    sa.Column('blank_id', sa.String(), nullable=True),
    sa.Column('misconception_id', sa.String(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['session_id'], ['learning_sessions.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('voice_signal_scores',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('session_id', sa.String(), nullable=False),
    sa.Column('transcript_coverage_score', sa.Float(), nullable=False),
    sa.Column('speech_rate_wpm', sa.Float(), nullable=True),
    sa.Column('hesitation_flags', sa.JSON(), nullable=False),
    sa.Column('signal_degraded', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['session_id'], ['learning_sessions.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('session_id')
    )
    op.create_table('interaction_events',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('turn_id', sa.String(), nullable=False),
    sa.Column('event_type', sa.String(), nullable=False),
    sa.Column('payload', sa.JSON(), nullable=False),
    sa.Column('is_correct', sa.Boolean(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['turn_id'], ['dialogue_turns.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('interaction_events')
    op.drop_table('voice_signal_scores')
    op.drop_table('dialogue_turns')
    op.drop_table('checkpoint_results')
    with op.batch_alter_table('baseline_messages', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_baseline_messages_session_id'))

    op.drop_table('baseline_messages')
    with op.batch_alter_table('quiz_results', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_quiz_results_concept_id'))

    op.drop_table('quiz_results')
    with op.batch_alter_table('mastery_records', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_mastery_records_module_id'))
        batch_op.drop_index(batch_op.f('ix_mastery_records_concept_id'))

    op.drop_table('mastery_records')
    with op.batch_alter_table('learning_sessions', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_learning_sessions_module_id'))
        batch_op.drop_index(batch_op.f('ix_learning_sessions_concept_id'))

    op.drop_table('learning_sessions')
    with op.batch_alter_table('doubt_log_entries', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_doubt_log_entries_misconception_id'))
        batch_op.drop_index(batch_op.f('ix_doubt_log_entries_concept_id'))

    op.drop_table('doubt_log_entries')
    with op.batch_alter_table('badges', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_badges_badge_code'))

    op.drop_table('badges')
    with op.batch_alter_table('verified_knowledge_records', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_verified_knowledge_records_module_id'))
        batch_op.drop_index(batch_op.f('ix_verified_knowledge_records_concept_id'))

    op.drop_table('verified_knowledge_records')
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_users_email'))

    op.drop_table('users')
