import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Home from '../Home.jsx';
import { trackAPI } from '../../services/api.js';

import testAudioUrl from '../../../../tracks/AIZO - King Gnu.wav';

vi.mock('../../components/TrackSearcher', () => ({
    default: ({ onResult, onError, onPlayTrack }) => (
        <div data-testid="track-searcher">
            <button data-testid="mock-play-search" onClick={() => onPlayTrack?.({ track_id: 99, track_name: 'Search Track', track_author: 'Search Artist' })}>
                Play Search Result
            </button>
            <button data-testid="mock-result" onClick={() => onResult?.({ track_id: 1, track_name: 'Found Track', track_author: 'Found Artist', matches: 5 })}>
                Trigger Result
            </button>
            <button data-testid="mock-error" onClick={() => onError?.(new Error('Search failed'))}>
                Trigger Error
            </button>
        </div>
    )
}));

vi.mock('../../components/Tracklist', () => ({
    default: ({ onPlayTrack, onTrackSelect, playingTrackId, isPlaying }) => (
        <div data-testid="track-list">
            <button 
                data-testid="play-track-1" 
                data-track-id="1"
                onClick={() => onPlayTrack?.({ track_id: 1, track_name: 'Track One', track_author: 'Artist One' })}
            >
                Play Track 1 {playingTrackId === 1 && isPlaying ? '(Playing)' : ''}
            </button>
            <button 
                data-testid="play-track-2" 
                data-track-id="2"
                onClick={() => onPlayTrack?.({ track_id: 2, track_name: 'Track Two', track_author: 'Artist Two' })}
            >
                Play Track 2
            </button>
            <button 
                data-testid="select-track-1"
                onClick={() => onTrackSelect?.({ track_id: 1, track_name: 'Track One', track_author: 'Artist One' })}
            >
                Select Track 1
            </button>
        </div>
    )
}));

vi.mock('../../services/api.js', () => ({
    trackAPI: {
        getTrackStreamUrl: vi.fn(),
        searchTrack: vi.fn(),
        getTracks: vi.fn(),
    }
}));

beforeAll(() => {
    HTMLAudioElement.prototype.play = vi.fn(() => Promise.resolve());
    HTMLAudioElement.prototype.pause = vi.fn();
});

afterAll(() => {
    vi.restoreAllMocks();
});

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

describe('Home', () => {
    const user = userEvent.setup();

    beforeEach(() => {
        vi.clearAllMocks();
        trackAPI.getTrackStreamUrl.mockResolvedValue(testAudioUrl);
    });

    test('рендерится без ошибок', () => {
        render(
            <MemoryRouter>
                <Home />
            </MemoryRouter>
        );

        expect(screen.getByText('PyShazam')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /admin/i })).toBeInTheDocument();
        expect(screen.getByTestId('track-searcher')).toBeInTheDocument();
        expect(screen.getByTestId('track-list')).toBeInTheDocument();
    });

    test('кнопка Admin перенаправляет на страницу авторизации', async () => {
        render(
            <MemoryRouter>
                <Home />
            </MemoryRouter>
        );

        await user.click(screen.getByRole('button', { name: /admin/i }));
        expect(mockNavigate).toHaveBeenCalledWith('/admin/login');
    });

    test('корректно передаёт результат поиска через onResult', async () => {

        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        render(
            <MemoryRouter>
                <Home />
            </MemoryRouter>
        );

        // Триггерим "успешный поиск" через мок-компонент
        await user.click(screen.getByTestId('mock-result'));
        await waitFor(() => {
            expect(consoleSpy).toHaveBeenCalledWith(
                'Найден трек:',
                expect.objectContaining({
                    track_id: 1,
                    track_name: 'Found Track',
                    track_author: 'Found Artist',
                    matches: 5
                })
            );
        });
    expect(screen.queryByTestId('search-result')).not.toBeInTheDocument();
        
        consoleSpy.mockRestore();
    });

    test('логгирует ошибку поиска при вызове onError', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        render(
            <MemoryRouter>
                <Home />
            </MemoryRouter>
        );

        await user.click(screen.getByTestId('mock-error'));

        expect(consoleSpy).toHaveBeenCalledWith('Ошибка поиска:', expect.any(Error));
        consoleSpy.mockRestore();
    });

    describe('воспроизведение треков (handleGlobalPlay)', () => {
        
        test('успешное воспроизведение нового трека', async () => {
            render(<MemoryRouter><Home /></MemoryRouter>);

            await user.click(screen.getByTestId('play-track-1'));

            await waitFor(() => {
                expect(trackAPI.getTrackStreamUrl).toHaveBeenCalledWith(1);
            });
            
            expect(HTMLAudioElement.prototype.play).toHaveBeenCalled();
        });

        test('пауза/продолжение того же трека', async () => {
            render(<MemoryRouter><Home /></MemoryRouter>);

            await user.click(screen.getByTestId('play-track-1'));
            await waitFor(() => {
                expect(HTMLAudioElement.prototype.play).toHaveBeenCalled();
            });
            expect(HTMLAudioElement.prototype.pause).not.toHaveBeenCalled();

            await user.click(screen.getByTestId('play-track-1'));
            await waitFor(() => {
                expect(HTMLAudioElement.prototype.pause).toHaveBeenCalled();
            });

            HTMLAudioElement.prototype.play.mockClear();
            await user.click(screen.getByTestId('play-track-1'));
            await waitFor(() => {
                expect(HTMLAudioElement.prototype.play).toHaveBeenCalledTimes(1);
            });
        });

        test('переключение на новый трек останавливает предыдущий', async () => {
            render(<MemoryRouter><Home /></MemoryRouter>);

            await user.click(screen.getByTestId('play-track-1'));
            await waitFor(() => {
                expect(trackAPI.getTrackStreamUrl).toHaveBeenCalledWith(1);
            });

            await user.click(screen.getByTestId('play-track-2'));
            
            await waitFor(() => {
                expect(HTMLAudioElement.prototype.pause).toHaveBeenCalled();
            });
            expect(trackAPI.getTrackStreamUrl).toHaveBeenCalledWith(2);
        });

        test('обработка ошибки при получении URL стрима', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            trackAPI.getTrackStreamUrl.mockRejectedValue(new Error('Stream unavailable'));

            render(<MemoryRouter><Home /></MemoryRouter>);

            await user.click(screen.getByTestId('play-track-1'));

            await waitFor(() => {
                expect(trackAPI.getTrackStreamUrl).toHaveBeenCalledWith(1);
            });
            expect(consoleSpy).toHaveBeenCalledWith('Global play failed', expect.any(Error));
            
            expect(HTMLAudioElement.prototype.play).not.toHaveBeenCalled();
            
            consoleSpy.mockRestore();
        });

        test('событие onended сбрасывает состояние плеера', async () => {
            render(<MemoryRouter><Home /></MemoryRouter>);

            await user.click(screen.getByTestId('play-track-1'));
            await waitFor(() => {
                expect(HTMLAudioElement.prototype.play).toHaveBeenCalled();
            });

            const playCountBefore = HTMLAudioElement.prototype.play.mock.calls.length;
            
            await user.click(screen.getByTestId('play-track-1')); // pause
            await user.click(screen.getByTestId('play-track-1')); // play again
            
            await waitFor(() => {
                expect(HTMLAudioElement.prototype.play).toHaveBeenCalledTimes(playCountBefore + 1);
            });
        });
    }); 

    test('очистка аудио при размонтировании компонента', async () => {
        const { unmount } = render(
            <MemoryRouter>
                <Home />
            </MemoryRouter>
        );

        // Запускаем воспроизведение
        await user.click(screen.getByTestId('play-track-1'));
        await waitFor(() => {
            expect(HTMLAudioElement.prototype.play).toHaveBeenCalled();
        });

        // Размонтируем компонент
        unmount();

        // 🔥 Ждём, пока useEffect cleanup вызовет pause
        await waitFor(() => {
            expect(HTMLAudioElement.prototype.pause).toHaveBeenCalled();
        });
    });
});