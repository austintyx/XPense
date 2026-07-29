"""add password hash to users

Revision ID: e7c09fc754ca
Revises: 138800a679b7
Create Date: 2026-07-30 00:11:07.775773

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e7c09fc754ca'
down_revision: Union[str, Sequence[str], None] = '138800a679b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('users', sa.Column('password_hash', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('users', 'password_hash')
