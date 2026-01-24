"""add message metadata fields

Revision ID: 75c659a148a2
Revises: 735a94807488
Create Date: 2025-12-29 00:56:09.739025

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import expression


# revision identifiers, used by Alembic.
revision: str = '75c659a148a2'
down_revision: Union[str, Sequence[str], None] = '735a94807488'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    """Upgrade schema."""

    # ----- CARD VERSION META -----
    op.add_column(
        'card_versions',
        sa.Column('source_refs', sa.Text(), nullable=True)
    )
    op.add_column(
        'card_versions',
        sa.Column('confidence', sa.Integer(), nullable=True)
    )

    # ----- CARD META -----
    op.add_column(
        'cards',
        sa.Column('tags_json', sa.Text(), nullable=True)
    )
    op.add_column(
        'cards',
        sa.Column('review_state', sa.String(length=50), nullable=True)
    )

    # ----- MESSAGE META -----
    op.add_column(
        'messages',
        sa.Column('type', sa.String(length=50), nullable=True)
    )

    op.add_column(
        'messages',
        sa.Column('topic', sa.String(length=255), nullable=True)
    )

    op.add_column(
        'messages',
        sa.Column('attachments_json', sa.Text(), nullable=True)
    )

    op.add_column(
        'messages',
        sa.Column(
            'include_in_summary',
            sa.Boolean(),
            nullable=False,
            server_default=expression.true()
        )
    )

    op.add_column(
        'messages',
        sa.Column(
            'has_attachments',
            sa.Boolean(),
            nullable=False,
            server_default=expression.false()
        )
    )



def downgrade() -> None:
    """Downgrade schema."""

    op.drop_column('messages', 'topic')
    op.drop_column('messages', 'attachments_json')
    op.drop_column('messages', 'has_attachments')
    op.drop_column('messages', 'include_in_summary')
    op.drop_column('messages', 'type')

    op.drop_column('cards', 'review_state')
    op.drop_column('cards', 'tags_json')

    op.drop_column('card_versions', 'confidence')
    op.drop_column('card_versions', 'source_refs')
