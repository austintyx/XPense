from cryptography.fernet import Fernet

from app.security import crypto


def test_encrypt_decrypt_round_trip(monkeypatch):
    key = Fernet.generate_key().decode()
    monkeypatch.setattr(crypto.settings, "token_encryption_key", key)

    plaintext = "super-secret-refresh-token"
    ciphertext = crypto.encrypt(plaintext)

    assert ciphertext != plaintext
    assert crypto.decrypt(ciphertext) == plaintext


def test_encrypt_raises_clear_error_when_unconfigured(monkeypatch):
    monkeypatch.setattr(crypto.settings, "token_encryption_key", None)

    try:
        crypto.encrypt("anything")
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "TOKEN_ENCRYPTION_KEY" in str(exc)
