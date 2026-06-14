// src/components/__test__/Tracklist.test.jsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrackList from '../Tracklist';
import { trackAPI } from '../../services/api.js';

// 🔌 Мокаем API
vi.mock('../../services/api.js', () => ({
    trackAPI: {
        getTracks: vi.fn(),
        deleteTrack: vi.fn(),
    }
}));

// 🔌 Мокаем confirm
globalThis.confirm = vi.fn(() => true);

describe('TrackList Component', () => {
    const mockTracks = [
        {
            track_id: 1,
            track_name: 'Test Track 1',
            track_author: 'Test Artist 1',
        },
        {
            track_id: 2,
            track_name: 'Test Track 2',
            track_author: 'Test Artist 2',
        },
        {
            track_id: 3,
            track_name: 'Test Track 3',
            track_author: 'Test Artist 3',
        },
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        globalThis.confirm.mockReturnValue(true);
    });

    test('отображает заголовок библиотеки треков', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        expect(screen.getByText('Библиотека треков')).toBeInTheDocument();
    });

    test('загружает и отображает список треков', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Test Track 1')).toBeInTheDocument();
            expect(screen.getByText('Test Artist 1')).toBeInTheDocument();
        });

        expect(screen.getByText('Test Track 2')).toBeInTheDocument();
        expect(screen.getByText('Test Track 3')).toBeInTheDocument();
    });

    test('показывает сообщение об отсутствии треков', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: [],
            total: 0,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Треков пока нет. Загрузи первый!')).toBeInTheDocument();
        });
    });

    test('показывает "Ничего не найдено" при пустом результате поиска', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: [],
            total: 0,
            has_more: false,
        });

        const user = userEvent.setup();

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        const input = screen.getByPlaceholderText(/поиск по названию или автору/i);
        await user.type(input, 'nonexistent');

        await waitFor(() => {
            expect(screen.getByText('Ничего не найдено')).toBeInTheDocument();
        });
    });

    test('показывает состояние загрузки', async () => {
        // Бесконечное ожидание для имитации состояния загрузки
        trackAPI.getTracks.mockReturnValue(new Promise(() => {}));

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Загрузка...')).toBeInTheDocument();
        });
    });

    test('вызывает onTrackSelect при клике на трек', async () => {
        const onTrackSelect = vi.fn();
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        const user = userEvent.setup();

        render(
            <TrackList
                onTrackSelect={onTrackSelect}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Test Track 1')).toBeInTheDocument();
        });

        const trackButton = screen.getByText('Test Track 1').closest('.track-item-left');
        await user.click(trackButton);

        expect(onTrackSelect).toHaveBeenCalledWith(mockTracks[0]);
    });

    test('вызывает onPlayTrack при клике на кнопку воспроизведения', async () => {
        const onPlayTrack = vi.fn();
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        const user = userEvent.setup();

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={onPlayTrack}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Test Track 1')).toBeInTheDocument();
        });

        const playButtons = screen.getAllByRole('button');
        const trackPlayButton = playButtons.find(btn => btn.title === 'Воспроизвести');
        if (trackPlayButton) {
            await user.click(trackPlayButton);
            expect(onPlayTrack).toHaveBeenCalledWith(mockTracks[0], expect.any(Object));
        }
    });

    test('показывает кнопку паузы для активного трека', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={true}
                playingTrackId={1}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Test Track 1')).toBeInTheDocument();
        });

        const pauseButtons = screen.queryAllByText('⏸️');
        expect(pauseButtons.length).toBeGreaterThan(0);
    });

    test('показывает кнопку воспроизведения для неактивного трека', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Test Track 1')).toBeInTheDocument();
        });

        const playButtons = screen.queryAllByText('▶️');
        expect(playButtons.length).toBeGreaterThanOrEqual(3);
    });

    test('отображает информацию о странице', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/3 треков/)).toBeInTheDocument();
            expect(screen.getByText(/стр\. 1/i)).toBeInTheDocument();
        });
    });

     test('отображает информацию о странице', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/3 треков/)).toBeInTheDocument();
            expect(screen.getByText(/стр\. 1/i)).toBeInTheDocument();
        });
    });

     test('отображает информацию о странице', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/3 треков/)).toBeInTheDocument();
            expect(screen.getByText(/стр\. 1/i)).toBeInTheDocument();
        });
    });


     test('отображает информацию о странице', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/3 треков/)).toBeInTheDocument();
            expect(screen.getByText(/стр\. 1/i)).toBeInTheDocument();
        });
    });

     test('отображает информацию о странице', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/3 треков/)).toBeInTheDocument();
            expect(screen.getByText(/стр\. 1/i)).toBeInTheDocument();
        });
    });

    test('отображает пагинацию при наличии нескольких страниц', async () => {
        const tracks20 = Array.from({ length: 20 }, (_, i) => ({
            track_id: i + 1,
            track_name: `Track ${i + 1}`,
            track_author: `Artist ${i + 1}`,
        }));

        trackAPI.getTracks.mockResolvedValue({
            items: tracks20,
            total: 45,
            has_more: true,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/назад/i)).toBeInTheDocument();
            expect(screen.getByText(/вперёд/i)).toBeInTheDocument();
        });
    });

    test('переходит на следующую страницу при нажатии кнопки Вперёд', async () => {
        const tracks20 = Array.from({ length: 20 }, (_, i) => ({
            track_id: i + 1,
            track_name: `Track ${i + 1}`,
            track_author: `Artist ${i + 1}`,
        }));

        trackAPI.getTracks.mockResolvedValue({
            items: tracks20,
            total: 45,
            has_more: true,
        });

        const user = userEvent.setup();

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/вперёд/i)).toBeInTheDocument();
        });

        const forwardButton = screen.getByText(/вперёд/i);
        await user.click(forwardButton);

        await waitFor(() => {
            expect(trackAPI.getTracks).toHaveBeenCalledWith(20, 20, '');
        });
    });

    test('активирует кнопку Назад после перехода на вторую страницу', async () => {
        const tracks20 = Array.from({ length: 20 }, (_, i) => ({
            track_id: i + 1,
            track_name: `Track ${i + 1}`,
            track_author: `Artist ${i + 1}`,
        }));

        trackAPI.getTracks.mockResolvedValue({
            items: tracks20,
            total: 45,
            has_more: true,
        });

        const user = userEvent.setup();

        const { container } = render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/вперёд/i)).toBeInTheDocument();
        });

        await user.click(screen.getByText(/вперёд/i));

        await waitFor(() => {
            const pageInfo = container.querySelector('.track-pagination-info');
            expect(pageInfo).toHaveTextContent('Страница 2 из 3');
            const backButton = screen.getByText(/назад/i);
            expect(backButton).toBeEnabled();
        });
    });

    test('отключает кнопку Вперёд если есть вторая страница, но нет has_more', async () => {
        const tracks20 = Array.from({ length: 20 }, (_, i) => ({
            track_id: i + 1,
            track_name: `Track ${i + 1}`,
            track_author: `Artist ${i + 1}`,
        }));

        trackAPI.getTracks.mockResolvedValue({
            items: tracks20,
            total: 25,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            const forwardButton = screen.getByText(/вперёд/i);
            expect(forwardButton).toBeDisabled();
        });
    });

    test('не показывает разделитель если автор отсутствует', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: [
                {
                    track_id: 1,
                    track_name: 'Track Without Author',
                    track_author: '',
                },
            ],
            total: 1,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Track Without Author')).toBeInTheDocument();
        });

        expect(screen.queryByText('•')).toBeNull();
    });

    test('отключает кнопку Назад на первой странице', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 50,
            has_more: true,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Test Track 1')).toBeInTheDocument();
        });

        const backButton = screen.getByText(/назад/i);
        expect(backButton).toBeDisabled();
    });

    test('выполняет поиск по запросу в форме', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        const user = userEvent.setup();

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Test Track 1')).toBeInTheDocument();
        });

        const input = screen.getByPlaceholderText(/поиск по названию или автору/i);
        const submitButton = screen.getByRole('button', { name: /найти/i });

        await user.type(input, 'Artist');
        await user.click(submitButton);

        await waitFor(() => {
            expect(trackAPI.getTracks).toHaveBeenCalledWith(0, 20, 'Artist');
        });
    });

    test('обновляет поле поиска при вводе', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        const user = userEvent.setup();

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        const input = screen.getByPlaceholderText(/поиск по названию или автору/i);
        await user.type(input, 'Test Track');

        expect(input.value).toBe('Test Track');
    });

    test('обрабатывает ошибку при загрузке треков', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        trackAPI.getTracks.mockRejectedValue(new Error('API Error'));

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(consoleErrorSpy).toHaveBeenCalledWith('Ошибка загрузки треков:', expect.any(Error));
        });

        consoleErrorSpy.mockRestore();
    });

    test('сбрасывает страницу на первую при новом поиске', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 50,
            has_more: true,
        });

        const user = userEvent.setup();

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Test Track 1')).toBeInTheDocument();
        });

        // Переходим на вторую страницу
        const forwardButton = screen.getByText(/вперёд/i);
        await user.click(forwardButton);

        // Выполняем поиск
        const input = screen.getByPlaceholderText(/поиск по названию или автору/i);
        const submitButton = screen.getByRole('button', { name: /найти/i });

        await user.type(input, 'Test');
        await user.click(submitButton);

        await waitFor(() => {
            // Проверяем, что поиск выполнен с skip=0 (первая страница)
            expect(trackAPI.getTracks).toHaveBeenCalledWith(0, 20, 'Test');
        });
    });

    test('не удаляет трек если пользователь отменил подтверждение', async () => {
        globalThis.confirm.mockReturnValue(false);
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        expect(trackAPI.deleteTrack).not.toHaveBeenCalled();
    });

    test('отображает количество треков', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 42,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/42 треков/)).toBeInTheDocument();
        });
    });

    test('отображает информацию о странице с несколькими страницами', async () => {
        const tracks20 = Array.from({ length: 20 }, (_, i) => ({
            track_id: i + 1,
            track_name: `Track ${i + 1}`,
            track_author: `Artist ${i + 1}`,
        }));

        trackAPI.getTracks.mockResolvedValue({
            items: tracks20,
            total: 50,
            has_more: true,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText(/50 треков • стр\. 1 из 3/i)).toBeInTheDocument();
        });
    });

    test('отключает кнопку Вперёд когда нет больше треков', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Test Track 1')).toBeInTheDocument();
        });

        // Пагинация не должна быть отображена если всего одна страница
        const forwardButtons = screen.queryAllByText(/вперёд/i);
        expect(forwardButtons.length).toBe(0);
    });

    test('отображает иконку трека рядом с названием', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            const icons = screen.queryAllByText('🎧');
            expect(icons.length).toBeGreaterThanOrEqual(3);
        });
    });

    test('отображает разделитель между названием и автором', async () => {
        trackAPI.getTracks.mockResolvedValue({
            items: mockTracks,
            total: 3,
            has_more: false,
        });

        render(
            <TrackList
                onTrackSelect={vi.fn()}
                onPlayTrack={vi.fn()}
                isPlaying={false}
                playingTrackId={null}
            />
        );

        await waitFor(() => {
            const separators = screen.queryAllByText('•');
            expect(separators.length).toBeGreaterThanOrEqual(3);
        });
    });
});
