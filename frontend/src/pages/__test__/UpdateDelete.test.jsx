import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import UploadDelete from '../UploadDelete.jsx';
import { adminAuth } from '../../services/adminAuth.js';
import { trackAPI } from '../../services/api.js';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock('../../services/api.js', () => ({
    trackAPI: {
        getTracks: vi.fn(),
        uploadTrack: vi.fn(),
        deleteTrack: vi.fn(),
    },
}));

vi.mock('../../services/adminAuth.js', () => ({
    adminAuth: {
        isLoggedIn: vi.fn(),
        clearToken: vi.fn(),
    },
}));

describe('UploadDelete', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        adminAuth.isLoggedIn.mockReturnValue(true);
        trackAPI.getTracks.mockResolvedValue({
            items: [
                {
                    track_id: 42,
                    track_name: 'Test Track',
                    track_author: 'Test Artist'
                },
            ],
        });
    });

    test('редирект на страницу авторизации, если не залогинен', async () => {
        adminAuth.isLoggedIn.mockReturnValue(false);

        render(
            <MemoryRouter>
                <UploadDelete />
            </MemoryRouter>
        );

        await waitFor(() => {
            expect(mockNavigate).toHaveBeenCalledWith('/admin/login');
        });
    });

    test('загрузка списка треков при открытии страницы', async () => {
        render(
            <MemoryRouter>
                <UploadDelete />
            </MemoryRouter>
        );

        expect(await screen.findByText('Test Track')).toBeInTheDocument();
        expect(screen.getByText('Test Artist')).toBeInTheDocument();
        expect(trackAPI.getTracks).toHaveBeenCalledWith(0,100);
    });

    test('ошибка отправки формы при отсутствии файла', async () => {
        render(
            <MemoryRouter>
                <UploadDelete />
            </MemoryRouter>
        );

        await userEvent.type(screen.getByLabelText(/track name/i), 'New Track');
        await userEvent.click(screen.getByRole('button', { name: /upload track/i }));
        expect(await screen.findByText('Please select a file and enter track name')).toBeInTheDocument();
        expect(trackAPI.uploadTrack).not.toHaveBeenCalledWith();
    });

    test('успешная отправка файла', async () => {
        trackAPI.uploadTrack.mockResolvedValue({id: 42});
        render(
            <MemoryRouter>
                <UploadDelete />
            </MemoryRouter>
        );

        const file = new File(['audio'], 'song.wav', { type: 'audio/wav' });

        const fileInput = screen.getByLabelText(/audio file/i);
        const nameInput = screen.getByLabelText(/track name/i);
        const authorInput = screen.getByLabelText(/artist/i);

        await userEvent.upload(fileInput, file);
        await userEvent.type(nameInput, 'New Song');
        await userEvent.type(authorInput, 'New Artist');
        await userEvent.click(screen.getByRole('button', { name: /upload track/i }));

        await waitFor(() => {
        expect(trackAPI.uploadTrack).toHaveBeenCalledWith(file, 'New Song', 'New Artist');
        });

        expect(await screen.findByText('Track uploaded successfully!')).toBeInTheDocument();
    });

    test('ошибка удаления файла', async () => {
        global.confirm = vi.fn(() => true);
        trackAPI.deleteTrack.mockRejectedValue(new Error('Delete failed'));
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <UploadDelete />
            </MemoryRouter>
        );
        expect(await screen.findByText('Test Track')).toBeInTheDocument();
        const deleteBtn = screen.getAllByRole('button', { name: /delete/i })[0];
        await user.click(deleteBtn);
        expect(await screen.findByText(/Delete failed/i)).toBeInTheDocument();
        expect(trackAPI.deleteTrack).toHaveBeenCalledWith(42);
    });


    test('успешное удаление трека', async () => {
    global.confirm = vi.fn(() => true);
    trackAPI.deleteTrack.mockResolvedValue(true);
    
    const user = userEvent.setup();
    
    render(
        <MemoryRouter>
            <UploadDelete />
        </MemoryRouter>
    );

    expect(await screen.findByText('Test Track')).toBeInTheDocument();
    const deleteBtn = screen.getAllByRole('button', { name: /delete/i })[0];
    await user.click(deleteBtn);
    expect(trackAPI.deleteTrack).toHaveBeenCalledWith(42);
    expect(await screen.findByText('Track deleted successfully!')).toBeInTheDocument();
    expect(trackAPI.getTracks).toHaveBeenCalledTimes(2);
});
});