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


def test_is_allowlisted_sender_accepts_paynow_and_scan_and_pay_addresses():
    assert is_allowlisted_sender("DBS Bank <alerts@dbs.com.sg>")
    assert is_allowlisted_sender("UOB <alerts@uob.com.sg>")


def test_is_allowlisted_sender_rejects_lookalike_and_marketing_senders():
    assert not is_allowlisted_sender("marketing@eDM.uob.com.sg")
    assert not is_allowlisted_sender("alerts@dbs.com.sg.evil.com")
    assert not is_allowlisted_sender("someone@gmail.com")


def test_is_allowlisted_sender_accepts_any_local_part_or_subdomain_at_youtrips_domain():
    # YouTrip's local part is VERP-rewritten and varies per send, AND the two mail providers this
    # app supports disagree on which header they surface for the same message: Gmail's From shows
    # the VERP address at mail.you.co, Graph's From shows the plain noreply@you.co (the Sender:
    # header, which Graph doesn't expose, is the VERP one) -- both real, both must be accepted.
    assert is_allowlisted_sender("noreply=you.co@mail.you.co")
    assert is_allowlisted_sender("bounce+abc123=you.co@mail.you.co")
    assert is_allowlisted_sender("On behalf of YouTrip <noreply=you.co@mail.you.co>")
    assert is_allowlisted_sender("YouTrip <noreply@you.co>")


def test_is_allowlisted_sender_rejects_youtrip_domain_lookalikes():
    # Genuine subdomains of you.co (mail.you.co, notmail.you.co -- both still end in ".you.co")
    # are legitimately accepted; only a domain that merely *resembles* you.co without actually
    # being it or a subdomain of it should be rejected.
    assert not is_allowlisted_sender("someone@you.co.evil.com")
    assert not is_allowlisted_sender("someone@notyou.co")
