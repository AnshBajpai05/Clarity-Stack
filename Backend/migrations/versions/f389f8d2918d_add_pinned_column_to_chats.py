"""add pinned column to chats

Revision ID: f389f8d2918d
Revises: 655bab2ce23f
Create Date: 2025-12-30 15:11:56.735059

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f389f8d2918d'
down_revision: Union[str, Sequence[str], None] = '655bab2ce23f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


from alembic import op
import sqlalchemy as sa


def upgrade():
    op.add_column(
        'chats',
        sa.Column('pinned', sa.Boolean(), nullable=False, server_default='0')
    )


def downgrade():
    op.drop_column('chats', 'pinned')
