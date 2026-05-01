"""add knowledge nodes

Revision ID: 1cc440e5bb00
Revises: f389f8d2918d
Create Date: 2026-01-22 18:53:38.126101
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '1cc440e5bb00'
down_revision: Union[str, Sequence[str], None] = 'f389f8d2918d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- Knowledge Nodes ---
    op.create_table(
        'knowledge_nodes',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('synthesis_id', sa.String(), nullable=True),
        sa.Column('section', sa.String(), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=True),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['synthesis_id'], ['synthesis.id']),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_index('ix_knowledge_nodes_section', 'knowledge_nodes', ['section'])
    op.create_index('ix_knowledge_nodes_synthesis_id', 'knowledge_nodes', ['synthesis_id'])

    # --- Knowledge Edges ---
    op.create_table(
        'knowledge_edges',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('from_node_id', sa.String(), nullable=True),
        sa.Column('to_node_id', sa.String(), nullable=True),
        sa.Column('relation', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['from_node_id'], ['knowledge_nodes.id']),
        sa.ForeignKeyConstraint(['to_node_id'], ['knowledge_nodes.id']),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_index('ix_knowledge_edges_from_node_id', 'knowledge_edges', ['from_node_id'])
    op.create_index('ix_knowledge_edges_to_node_id', 'knowledge_edges', ['to_node_id'])
    op.create_index('ix_knowledge_edges_relation', 'knowledge_edges', ['relation'])


def downgrade() -> None:
    op.drop_index('ix_knowledge_edges_relation', table_name='knowledge_edges')
    op.drop_index('ix_knowledge_edges_to_node_id', table_name='knowledge_edges')
    op.drop_index('ix_knowledge_edges_from_node_id', table_name='knowledge_edges')
    op.drop_table('knowledge_edges')

    op.drop_index('ix_knowledge_nodes_synthesis_id', table_name='knowledge_nodes')
    op.drop_index('ix_knowledge_nodes_section', table_name='knowledge_nodes')
    op.drop_table('knowledge_nodes')
