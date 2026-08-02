"""add country to transactions

Revision ID: 4570a3abd401
Revises: e7c09fc754ca
Create Date: 2026-08-02 22:33:34.672427

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4570a3abd401'
down_revision: Union[str, Sequence[str], None] = 'e7c09fc754ca'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('transactions', sa.Column('country', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('transactions', 'country')
