"""Tests for npub exposure in seller API responses."""

from __future__ import annotations

from app.repositories.sellers import _extract_npub
from app.schemas import SellerResult


def test_extract_npub_from_list():
    """Test extracting npub from a list of public keys."""
    # Test with npub present
    keys = [
        "1234567890abcdef" * 4,  # hex key
        "npub1qwertyuiopasdfghjklzxcvbnm",  # npub
        "npub1anotherkeyhere123456789",
    ]
    npub = _extract_npub(keys)
    assert npub == "npub1qwertyuiopasdfghjklzxcvbnm"
    assert npub.startswith("npub1")


def test_extract_npub_returns_none_when_missing():
    """Test that extract_npub converts hex to npub when no npub present."""
    keys = [
        "1234567890abcdef" * 4,  # only hex key - should be converted to npub
        "someinvalidkey",
    ]
    npub = _extract_npub(keys)
    # Should convert the hex key to npub format
    assert npub is not None
    assert npub.startswith("npub1")


def test_extract_npub_from_empty_list():
    """Test extract_npub with empty list."""
    npub = _extract_npub([])
    assert npub is None


def test_extract_npub_validates_format():
    """Test that extract_npub validates npub format."""
    keys = [
        "npub",  # too short
        "npub1",  # too short
        "notanpub1234567890",  # doesn't start with npub1
    ]
    npub = _extract_npub(keys)
    assert npub is None


def test_seller_result_has_npub_field():
    """Test that SellerResult schema includes npub field."""
    seller = SellerResult(
        id="test-123",
        name="Test Restaurant",
        npub="npub1test123456789",
        normalized_pubkeys=["npub1test123456789", "abcd" * 16],
    )
    assert seller.npub == "npub1test123456789"
    assert len(seller.normalized_pubkeys) == 2


def test_seller_result_npub_can_be_none():
    """Test that SellerResult allows None for npub."""
    seller = SellerResult(
        id="test-456",
        name="Test Shop",
        npub=None,
        normalized_pubkeys=[],
    )
    assert seller.npub is None
    assert seller.normalized_pubkeys == []


def test_seller_result_default_normalized_pubkeys():
    """Test that normalized_pubkeys defaults to empty list."""
    seller = SellerResult(
        id="test-789",
        name="Test Store",
    )
    assert seller.normalized_pubkeys == []
    assert seller.npub is None


def test_seller_result_serialization():
    """Test that SellerResult with npub serializes correctly."""
    seller = SellerResult(
        id="test-serial",
        name="Test Business",
        npub="npub1serialtest123",
        normalized_pubkeys=["npub1serialtest123"],
    )
    data = seller.model_dump()
    assert data["npub"] == "npub1serialtest123"
    assert data["normalized_pubkeys"] == ["npub1serialtest123"]
    assert isinstance(data["normalized_pubkeys"], list)


def test_seller_result_with_real_npub_format():
    """Test SellerResult with realistic npub format."""
    # Realistic npub has 63 characters (npub1 + 58 chars)
    realistic_npub = "npub1" + "a" * 58
    seller = SellerResult(
        id="test-real",
        name="Real Restaurant",
        npub=realistic_npub,
    )
    assert seller.npub == realistic_npub
    assert len(seller.npub) == 63

