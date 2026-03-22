import numpy as np
import scipy as scp
import matplotlib.pyplot as plt
from scipy.fft import fft, fftfreq
from scipy.io.wavfile import read
from scipy import signal 
import psycopg2 as psycopg


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

if __name__ == '__main__':
    Fs, song = read("Eve_-_Kaikai_Kitan_(SkySound.cc).wav")
    arr = create_map(song, Fs)
    plt.scatter([i[0] for i in arr], [i[1] for i in arr])
    plt.show()
    conn = psycopg.connect(dbname='tracks', user='seeker', password='secret_pass', host='localhost')
    cr = conn.cursor()
    cr.execute("SELECT * FROM sounds.tracks;")
    print(cr.fetchall()[0][0])
    res = create_fingerprints(arr)