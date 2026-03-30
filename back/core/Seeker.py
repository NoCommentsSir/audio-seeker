import numpy as np
from scipy.io.wavfile import read
from scipy import signal 
from back.db.database import SessionLocal
from back.db.models import Track_Fingerprint, Track
from pathlib import Path
import os

BASE_DIR = Path(__file__).resolve().parent
TRACKS_DIR = BASE_DIR.parent.parent / 'tracks'

def create_map(audio, Fs):
    # Конфиги
    window_length_seconds = 0.5
    window_length_samples = int(window_length_seconds * Fs)
    window_length_samples += window_length_samples % 2
    amount_to_pad = window_length_samples - audio.size % window_length_samples
    num_peaks = 10

    # Преобразование Фурье
    song_in = np.pad(audio, (0, amount_to_pad))
    freqs, times, arr = signal.stft(
        song_in, Fs, nperseg=window_length_samples, nfft=window_length_samples, return_onesided=True
    )

    res = []
    for j in range(arr.shape[1]):
        real = abs(arr[:, j])
        peaks, props = signal.find_peaks(real, prominence=0.01, distance=50)
        N = min(num_peaks, len(peaks))

        # По топ N максимальным пикам строим карту
        largest_peaks = np.argpartition(props["prominences"], -N)[-N:]
        for peak in peaks[largest_peaks]:
            freq = freqs[peak]
            res.append([j, freq])
    return np.array(res)

def create_fingerprints(map, delta = 10, max_targets = 10):
    arr = map[map[:,0].argsort()]
    upper_frequency = 23000 
    frequency_bits = 10
    total = []

    for peak in range(len(arr)):
        cnt = 1
        while peak + cnt < len(arr) and cnt <= max_targets and arr[peak + cnt][0] - arr[peak][0] < delta:
            f1 = arr[peak][1] / upper_frequency * (2 ** frequency_bits)
            f2 = arr[peak + cnt][1] / upper_frequency * (2 ** frequency_bits)
            dt = arr[peak + cnt][0] - arr[peak][0]
            code = int(f1) | (int(f2) << 10) | (int(dt) << 20)
            total.append([code, int(arr[peak][0])])
            cnt += 1

    return total

def search_match(audio, matches_threshold = 5):
    Fs, song = read(audio)
    arr = create_map(song, Fs)
    fingerprints = create_fingerprints(arr)
    matches = {}

    with SessionLocal() as pcl:
        arr = []
        for hash_code, anchor_time in fingerprints:
            db_fingerprints = pcl.query(Track_Fingerprint).filter(
                Track_Fingerprint.hash_code == hash_code
            ).all()

            for db_fpr in db_fingerprints:
                if db_fpr.track_id in matches.keys():
                    matches[db_fpr.track_id].append(
                        (db_fpr.anchor_time, anchor_time)
                    )
                else:
                    matches[db_fpr.track_id] = [(db_fpr.anchor_time, anchor_time)]

        best_track_id = None
        max_matches = 0
        best_delta = 0

        for track_id, points in matches.items():

            if len(points) < matches_threshold:
                continue

            deltas = np.array([db_time - q_time for db_time, q_time in points])
            unique_deltas, counts = np.unique(deltas, return_counts=True)
            max_idx = np.argmax(counts)
            common_delta = unique_deltas[max_idx]
            common_delta_count = counts[max_idx]
            common_delta_count = counts[max_idx]

            if common_delta_count > max_matches:
                max_matches = int(common_delta_count)
                best_delta = int(common_delta)
                best_track_id = track_id
            
        if best_track_id:
            best_track_matching = pcl.query(Track).filter(
                Track.track_id == best_track_id
            ).first()

            return {
                    "track_id": best_track_matching.track_id,
                    "track_name": best_track_matching.track_name,
                    "track_author": best_track_matching.track_author,
                    "track_minio_key": str(best_track_matching.track_minio_key),
                    "matches": max_matches,
                    "time_offset": best_delta
                }
        
    return None

if __name__ == '__main__':
    file = Path('output.wav')
    track = TRACKS_DIR / file
    print(search_match(track, 10))