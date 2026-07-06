import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useLogin } from '../auth/useAuth';

type Fields = { email: string; password: string };

// Login form: email (type=text) + password, both required only (parity with the
// Angular form — no email-format validator). Errors surface via GlobalInterceptor-style
// toasts (query error handler); success → toast + navigate /home.
export const LoginForm = () => {
  const {
    register,
    handleSubmit,
    formState: { isValid },
  } = useForm<Fields>({ mode: 'onChange' });
  const login = useLogin();
  const navigate = useNavigate();

  const onSubmit = (values: Fields) =>
    login.mutate(values, {
      onSuccess: () => {
        toast.success('Login effettuato correttamente');
        void navigate({ to: '/home' });
      },
    });

  return (
    <form
      className="w-100"
      style={{ maxWidth: 360, margin: '2rem auto' }}
      onSubmit={handleSubmit(onSubmit)}
    >
      <div className="mb-3">
        <label htmlFor="email" className="form-label">
          Email
        </label>
        <input
          id="email"
          type="text"
          autoComplete="username"
          className="form-control"
          {...register('email', { required: true })}
        />
      </div>
      <div className="mb-3">
        <label htmlFor="password" className="form-label">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className="form-control"
          {...register('password', { required: true })}
        />
      </div>
      <button type="submit" className="btn btn-primary" disabled={!isValid}>
        Login
      </button>
    </form>
  );
};
