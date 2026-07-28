"""drop transaction type

Revision ID: 1b9027170e89
Revises: 914daad6bb59
Create Date: 2026-07-28 17:10:14.423291

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1b9027170e89'
down_revision: Union[str, Sequence[str], None] = '914daad6bb59'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column('transactions', 'type')
    sa.Enum(name='transaction_type_enum').drop(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        'transactions',
        sa.Column(
            'type',
            sa.Enum('expense', 'transfer', 'income', name='transaction_type_enum'),
            server_default=sa.text("'expense'"),
            nullable=False,
        ),
    )
