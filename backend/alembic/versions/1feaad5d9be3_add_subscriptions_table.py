"""add subscriptions table

Revision ID: 1feaad5d9be3
Revises: 1b9027170e89
Create Date: 2026-07-28 23:37:44.470494

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1feaad5d9be3'
down_revision: Union[str, Sequence[str], None] = '1b9027170e89'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    frequency_enum = sa.Enum('weekly', 'monthly', 'quarterly', 'yearly', name='frequency_enum')
    op.create_table('subscriptions',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
    sa.Column('frequency', frequency_enum, nullable=False),
    sa.Column('next_due', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('subscriptions')
    sa.Enum(name='frequency_enum').drop(op.get_bind(), checkfirst=True)
