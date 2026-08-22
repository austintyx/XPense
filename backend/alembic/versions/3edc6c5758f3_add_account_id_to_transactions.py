"""add account_id to transactions

Revision ID: 3edc6c5758f3
Revises: 848fe3a78d42
Create Date: 2026-08-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3edc6c5758f3'
down_revision: Union[str, Sequence[str], None] = '848fe3a78d42'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('transactions', sa.Column('account_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_transactions_account_id_email_accounts',
        'transactions',
        'email_accounts',
        ['account_id'],
        ['id'],
        ondelete='CASCADE',
    )

    # Best-effort backfill: for a (user_id, provider) pair with exactly one linked EmailAccount,
    # every existing transaction of that provider unambiguously came from it. Where a user has 2+
    # accounts of the same provider, historical rows can't be reliably attributed -- account_id
    # stays NULL for those and they're simply never cascade-deleted by an unlink. New transactions
    # synced from here on always get an unambiguous account_id at insert time (see services/sync.py).
    op.execute(
        """
        UPDATE transactions t
        SET account_id = ea.id
        FROM email_accounts ea
        WHERE t.user_id = ea.user_id
          AND t.provider = ea.provider
          AND t.account_id IS NULL
          AND (
            SELECT COUNT(*) FROM email_accounts ea2
            WHERE ea2.user_id = ea.user_id AND ea2.provider = ea.provider
          ) = 1
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('fk_transactions_account_id_email_accounts', 'transactions', type_='foreignkey')
    op.drop_column('transactions', 'account_id')
