"""add merchant category cache

Revision ID: 138800a679b7
Revises: 1feaad5d9be3
Create Date: 2026-07-29 03:46:42.787848

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '138800a679b7'
down_revision: Union[str, Sequence[str], None] = '1feaad5d9be3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('merchant_category_cache',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('merchant_key', sa.String(), nullable=False),
    sa.Column('category', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_merchant_category_cache_merchant_key'), 'merchant_category_cache', ['merchant_key'], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_merchant_category_cache_merchant_key'), table_name='merchant_category_cache')
    op.drop_table('merchant_category_cache')
