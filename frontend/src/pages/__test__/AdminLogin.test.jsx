import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminLogin from '../AdminLogin.jsx';
import { adminAuth } from '../../services/adminAuth.js';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return {
        ...actual,
        useNavigate: () => mockNavigate,
    };
});

vi.mock('../../services/adminAuth.js', () => ({
    adminAuth: {
        login: vi.fn(),
    },
}));

describe('AdminLogin', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('успешный логин переводит на страницу загрузки', async () => {
        adminAuth.login.mockResolvedValue({
        access_token: 'test-token',
        token_type: 'bearer',
        });

        render(
        <MemoryRouter>
            <AdminLogin />
        </MemoryRouter>
        );

        await userEvent.type(screen.getByLabelText(/password/i), 'admin123');
        await userEvent.click(screen.getByRole('button', { name: /login/i }));

        await waitFor(() => {
        expect(adminAuth.login).toHaveBeenCalledWith('admin123');
        expect(mockNavigate).toHaveBeenCalledWith('/admin/upload');
        });
    });

    test('неуспешный логин показывает ошибку', async () => {
        adminAuth.login.mockRejectedValue(new Error('Invalid admin password'));

        render(
        <MemoryRouter>
            <AdminLogin />
        </MemoryRouter>
        );

        await userEvent.type(screen.getByLabelText(/password/i), 'wrong-password');
        await userEvent.click(screen.getByRole('button', { name: /login/i }));

        expect(await screen.findByText('Invalid admin password')).toBeInTheDocument();
        expect(mockNavigate).not.toHaveBeenCalled();
    });
});