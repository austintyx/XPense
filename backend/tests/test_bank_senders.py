from app.services.bank_senders import extract_address, is_allowlisted_sender


def test_extract_address_from_formatted_header():
    assert extract_address("DBS Bank <ibanking.alert@dbs.com>") == "ibanking.alert@dbs.com"


def test_extract_address_from_bare_address():
    assert extract_address("ibanking.alert@dbs.com") == "ibanking.alert@dbs.com"


def test_extract_address_is_case_insensitive():
    assert extract_address("DBS <IBanking.Alert@DBS.com>") == "ibanking.alert@dbs.com"


def test_is_allowlisted_sender_accepts_known_bank_addresses():
    assert is_allowlisted_sender("ibanking.alert@dbs.com")
    assert is_allowlisted_sender("UOB Singapore <unialerts@uobgroup.com>")


def test_is_allowlisted_sender_rejects_lookalike_and_marketing_senders():
    assert not is_allowlisted_sender("marketing@eDM.uob.com.sg")
    assert not is_allowlisted_sender("alerts@dbs.com.sg")
    assert not is_allowlisted_sender("someone@gmail.com")
