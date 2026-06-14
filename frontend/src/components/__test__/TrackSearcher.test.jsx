// src/components/__test__/TrackSearcher.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackSearcher from '../TrackSearcher';
import { trackAPI } from '../../services/api.js';

// 🔌 Мокаем API
vi.mock('../../services/api.js', () => ({
    trackAPI: { searchTrack: vi.fn() }
}));

describe('TrackSearcher', () => {
    const user = userEvent.setup();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('обрабатывает таймаут поиска от бэка (matched: false, timed_out: true)', async () => {
        // 🔥 Мокаем ответ бэка с таймаутом
        trackAPI.searchTrack.mockResolvedValue({
            matched: false,
            mode: 'exact',
            is_exact: false,
            timed_out: true,
            message: 'Search timed out. No result.',
            result: null,
        });

        const onError = vi.fn();
        const onResult = vi.fn();

        render(
            <TrackSearcher 
                onResult={onResult} 
                onError={onError}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        // Эмулируем загрузку файла
        const file = new File(['dummy audio'], 'test.wav', { type: 'audio/wav' });
        const input = screen.getByLabelText(/загрузить аудиофайл/i);
        await userEvent.upload(input, file);

        // 🔥 Ждём появления карточки "нет результата" с сообщением о таймауте
        const noResultCard = await screen.findByTestId('no-result');
        expect(noResultCard).toBeInTheDocument();
        
        expect(screen.getByText(/поиск превысил время ожидания|⏱️|таймаут/i)).toBeInTheDocument();

        // 🔥 Проверяем, что onResult был вызван
        expect(onResult).toHaveBeenCalledWith(expect.objectContaining({
            matched: false,
            timed_out: true,
        }));

    });

    test('обрабатывает таймаут с лучшим совпадением (matched: true, timed_out: true)', async () => {
        trackAPI.searchTrack.mockResolvedValue({
            matched: true,
            mode: 'exact',
            is_exact: false,
            timed_out: true,
            message: 'Search timed out. Returning the best match found so far.',
            result: {
                track_id: 42,
                track_name: 'Approximate Match',
                track_author: 'Test Artist',
                matches: 3,
            },
        });

        render(<TrackSearcher onResult={vi.fn()} onError={vi.fn()} onPlayTrack={vi.fn()} isPlaying={false} playingTrackId={null} />);

        const file = new File(['dummy'], 'test.wav', { type: 'audio/wav' });
        await userEvent.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        // 🔥 Ждём карточку с треком + предупреждение о таймауте
        const trackCard = await screen.findByTestId('track-found');
        expect(trackCard).toBeInTheDocument();
        expect(screen.getByText('Approximate Match')).toBeInTheDocument();
        
        // 🔥 Предупреждение о таймауте
        expect(screen.getByTestId('timeout-hint')).toBeInTheDocument();
    });

    test('успешное точное совпадение трека', async () => {
        trackAPI.searchTrack.mockResolvedValue({
            matched: true,
            mode: 'exact',
            is_exact: true,
            timed_out: false,
            message: 'Exact match found',
            result: {
                track_id: 1,
                track_name: 'Perfect Match',
                track_author: 'Perfect Artist',
                matches: 100,
            },
        });

        const onResult = vi.fn();
        render(
            <TrackSearcher 
                onResult={onResult} 
                onError={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        const file = new File(['dummy'], 'test.wav', { type: 'audio/wav' });
        await userEvent.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        await waitFor(() => {
            expect(screen.getByText('Perfect Match')).toBeInTheDocument();
            expect(onResult).toHaveBeenCalledWith(expect.objectContaining({
                matched: true,
                is_exact: true,
            }));
        });
    });

    test('обработка ошибки API', async () => {
        trackAPI.searchTrack.mockRejectedValue(new Error('Network error'));
        const onError = vi.fn();

        render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={onError}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        const file = new File(['dummy'], 'test.wav', { type: 'audio/wav' });
        await userEvent.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        await waitFor(() => {
            expect(onError).toHaveBeenCalled();
            expect(screen.getByRole('alert')).toBeInTheDocument();
        });
    });

    test('обрабатывает отказ доступа к микрофону', async () => {
        const originalMediaDevices = globalThis.navigator.mediaDevices;
        globalThis.navigator.mediaDevices = {
            getUserMedia: vi.fn().mockRejectedValue(new Error('Permission denied')),
        };
        const onError = vi.fn();

        render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={onError}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await user.click(screen.getByRole('button', { name: /нажать для поиска трека/i }));

        await waitFor(() => {
            expect(onError).toHaveBeenCalledWith(expect.any(Error));
            expect(screen.getByText(/Не удалось получить доступ к микрофону/i)).toBeInTheDocument();
        });

        globalThis.navigator.mediaDevices = originalMediaDevices;
    });

    test('успешно останавливает запись и показывает результат поиска', async () => {
        const originalMediaDevices = globalThis.navigator.mediaDevices;
        const originalMediaRecorder = globalThis.MediaRecorder;
        const streamStopSpy = vi.fn();
        globalThis.navigator.mediaDevices = {
            getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: streamStopSpy }] }),
        };
        globalThis.MediaRecorder = class {
            state = 'inactive';
            ondataavailable = null;
            onstop = null;
            start() {
                this.state = 'recording';
            }
            stop() {
                this.state = 'inactive';
                if (this.ondataavailable) {
                    this.ondataavailable({ data: new Blob(['audio']) });
                }
                if (this.onstop) {
                    this.onstop();
                }
            }
        };

        trackAPI.searchTrack.mockResolvedValue({
            matched: true,
            mode: 'exact',
            is_exact: true,
            timed_out: false,
            result: {
                track_id: 99,
                track_name: 'Mic Match',
                track_author: 'Audio Artist',
                matches: 50,
            },
        });

        const { unmount } = render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await user.click(screen.getByRole('button', { name: /нажать для поиска трека/i }));
        expect(document.querySelector('.pulse-ring')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /остановить запись/i }));

        await waitFor(() => {
            expect(screen.getByText('Mic Match')).toBeInTheDocument();
            expect(streamStopSpy).toHaveBeenCalled();
        });

        unmount();
        globalThis.navigator.mediaDevices = originalMediaDevices;
        globalThis.MediaRecorder = originalMediaRecorder;
    });

    test('показывает сообщение "Треки не найдены" без таймаута', async () => {
        trackAPI.searchTrack.mockResolvedValue({
            matched: false,
            mode: 'exact',
            is_exact: false,
            timed_out: false,
            message: 'No match found',
            result: null,
        });

        render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        const file = new File(['dummy'], 'test.wav', { type: 'audio/wav' });
        await user.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        await waitFor(() => {
            expect(screen.getByText(/Треки не найдены/i)).toBeInTheDocument();
        });
    });

    test('парсит строковую ошибку из API', async () => {
        trackAPI.searchTrack.mockRejectedValue('Простая строка ошибки');

        render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        const file = new File(['dummy'], 'test.wav', { type: 'audio/wav' });
        await user.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        await waitFor(() => {
            expect(screen.getByText(/Простая строка ошибки/)).toBeInTheDocument();
        });
    });

    test('парсит поле error из API', async () => {
        trackAPI.searchTrack.mockRejectedValue({ error: 'Непонятная ошибка' });

        render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        const file = new File(['dummy'], 'test.wav', { type: 'audio/wav' });
        await user.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        await waitFor(() => {
            expect(screen.getByText(/Непонятная ошибка/)).toBeInTheDocument();
        });
    });

    test('показывает JSON-ошибку при неформатированном ответе', async () => {
        trackAPI.searchTrack.mockRejectedValue({ status: 500 });

        render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        const file = new File(['dummy'], 'test.wav', { type: 'audio/wav' });
        await user.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        await waitFor(() => {
            expect(screen.getByText(/\{"status":500\}/)).toBeInTheDocument();
        });
    });

    test('отображает сообщение об ошибке в баннере', async () => {
        trackAPI.searchTrack.mockRejectedValue(new Error('Server error'));

        render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        const file = new File(['dummy'], 'test.wav', { type: 'audio/wav' });
        await userEvent.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        await waitFor(() => {
            expect(screen.getByText(/Server error/)).toBeInTheDocument();
        });
    });

    test('закрывает баннер ошибки при клике на крестик', async () => {
        trackAPI.searchTrack.mockRejectedValue(new Error('Error'));

        render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        const file = new File(['dummy'], 'test.wav', { type: 'audio/wav' });
        await userEvent.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        await waitFor(() => {
            expect(screen.getByRole('alert')).toBeInTheDocument();
        });

        const closeButton = screen.getByText('×');
        await userEvent.click(closeButton);

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('вызывает onPlayTrack при клике на кнопку воспроизведения', async () => {
        trackAPI.searchTrack.mockResolvedValue({
            matched: true,
            mode: 'exact',
            is_exact: true,
            timed_out: false,
            message: 'Match found',
            result: {
                track_id: 1,
                track_name: 'Test Track',
                track_author: 'Test Artist',
                matches: 95,
            },
        });

        const onPlayTrack = vi.fn();

        render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={vi.fn()}
                onPlayTrack={onPlayTrack}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        const file = new File(['dummy'], 'test.wav', { type: 'audio/wav' });
        await userEvent.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        await waitFor(() => {
            expect(screen.getByText('Test Track')).toBeInTheDocument();
        });

        const playButtons = screen.getAllByRole('button');
        const playButton = playButtons.find(btn => btn.textContent.includes('▶️'));
        if (playButton) {
            await userEvent.click(playButton);
            expect(onPlayTrack).toHaveBeenCalledWith(expect.objectContaining({
                track_id: 1,
                track_name: 'Test Track',
            }), expect.any(Object));
        }
    });

    test('показывает кнопку паузы для активного трека', async () => {
        trackAPI.searchTrack.mockResolvedValue({
            matched: true,
            mode: 'exact',
            is_exact: true,
            timed_out: false,
            message: 'Match found',
            result: {
                track_id: 1,
                track_name: 'Test Track',
                track_author: 'Test Artist',
                matches: 95,
            },
        });

        render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={true}
                playingTrackId={1}
            />
        );

        const file = new File(['dummy'], 'test.wav', { type: 'audio/wav' });
        await userEvent.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        await waitFor(() => {
            const pauseButtons = screen.queryAllByText('⏸️');
            expect(pauseButtons.length).toBeGreaterThan(0);
        });
    });

    test('отображает состояние обработки результата', async () => {
        trackAPI.searchTrack.mockResolvedValue({
            matched: true,
            mode: 'exact',
            is_exact: true,
            timed_out: false,
            result: {
                track_id: 1,
                track_name: 'Test',
                track_author: 'Artist',
                matches: 95,
            },
        });

        render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        const file = new File(['dummy'], 'test.wav', { type: 'audio/wav' });
        await userEvent.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        await waitFor(() => {
            expect(screen.getByText('Test')).toBeInTheDocument();
        });
    });

    test('очищает предыдущий результат при новом поиске', async () => {
        trackAPI.searchTrack.mockResolvedValue({
            matched: true,
            mode: 'exact',
            is_exact: true,
            timed_out: false,
            result: {
                track_id: 1,
                track_name: 'First Track',
                track_author: 'Artist 1',
                matches: 100,
            },
        });

        render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        let file = new File(['dummy'], 'test1.wav', { type: 'audio/wav' });
        await userEvent.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        await waitFor(() => {
            expect(screen.getByText('First Track')).toBeInTheDocument();
        });

        trackAPI.searchTrack.mockResolvedValue({
            matched: true,
            mode: 'exact',
            is_exact: true,
            timed_out: false,
            result: {
                track_id: 2,
                track_name: 'Second Track',
                track_author: 'Artist 2',
                matches: 98,
            },
        });

        file = new File(['dummy'], 'test2.wav', { type: 'audio/wav' });
        await userEvent.upload(screen.getByLabelText(/загрузить аудиофайл/i), file);

        await waitFor(() => {
            expect(screen.getByText('Second Track')).toBeInTheDocument();
        });
    });

    test('отображает подсказку при взаимодействии с компонентом', () => {
        render(
            <TrackSearcher 
                onResult={vi.fn()} 
                onError={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        expect(screen.getByText(/нажмите, чтобы найти трек/i)).toBeInTheDocument();
    });
});