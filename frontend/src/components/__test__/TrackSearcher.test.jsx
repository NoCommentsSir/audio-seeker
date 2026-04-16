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
});