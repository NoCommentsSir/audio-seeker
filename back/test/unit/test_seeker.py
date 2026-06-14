import numpy as np
import pytest

from back.core import Seeker
from back.core.Seeker import ProcessingDeadlineExceeded


def test_check_deadline_none_does_not_raise():
    Seeker._check_deadline(None)


def test_check_deadline_raises_when_deadline_passed():
    with pytest.raises(ProcessingDeadlineExceeded, match="Processing exceeded the allowed time limit"):
        Seeker._check_deadline(0.0)


def test_create_map_returns_empty_when_no_peaks():
    audio = np.zeros(1024, dtype=float)
    result = Seeker.create_map(audio, Fs=44100)

    assert result.shape == (0, 2)
    assert result.size == 0


def test_create_map_respects_deadline_during_processing(monkeypatch):
    audio = np.zeros(1024, dtype=float)
    calls = [0]

    def fake_monotonic():
        calls[0] += 1
        return 0.0 if calls[0] == 1 else 1.0

    monkeypatch.setattr(Seeker.time, "monotonic", fake_monotonic)

    with pytest.raises(ProcessingDeadlineExceeded):
        Seeker.create_map(audio, Fs=44100, deadline=0.5)


def test_create_fingerprints_returns_empty_for_empty_map():
    empty_map = np.empty((0, 2))
    result = Seeker.create_fingerprints(empty_map)

    assert result == []


@pytest.mark.parametrize(
    ("map_array", "expected"),
    [
        (
            np.array([[0, 1000.0], [5, 2000.0], [12, 3000.0]]),
            [
                [
                    int(1000.0 / 23000 * (2 ** 10))
                    | (int(2000.0 / 23000 * (2 ** 10)) << 10)
                    | (5 << 20),
                    0,
                ],
                [
                    int(2000.0 / 23000 * (2 ** 10))
                    | (int(3000.0 / 23000 * (2 ** 10)) << 10)
                    | (7 << 20),
                    5,
                ],
            ],
        ),
    ],
)
def test_create_fingerprints_generates_expected_codes(map_array, expected):
    result = Seeker.create_fingerprints(map_array, delta=10, max_targets=10)

    assert result == expected


def test_create_fingerprints_raises_when_deadline_reached(monkeypatch):
    map_array = np.array([[0, 1000.0], [5, 2000.0]])
    calls = [0]

    def fake_monotonic():
        calls[0] += 1
        return 0.0 if calls[0] == 1 else 1.0

    monkeypatch.setattr(Seeker.time, "monotonic", fake_monotonic)

    with pytest.raises(ProcessingDeadlineExceeded):
        Seeker.create_fingerprints(map_array, deadline=0.5)
