import { Modal } from 'react-bootstrap';
import { useForm } from 'react-hook-form';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useMe } from '../auth/useAuth';
import { useSaveProfilo } from './queries';

type FormValues = { email: string; newPassword: string; confirmPassword: string };

type Props = { show: boolean; onHide: () => void };

// Port of the legacy user-profile component. One deliberate change: the legacy compared
// the two passwords inside its submit handler and raised a toast on mismatch; here it is
// a field-level validation, so the form simply stays invalid and Salva stays disabled.
export const ProfiloModal = ({ show, onHide }: Props) => {
  const me = useMe();
  const save = useSaveProfilo();
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<FormValues>({
    mode: 'onChange',
    defaultValues: { email: me.data?.email ?? '', newPassword: '', confirmPassword: '' },
  });

  const onSubmit = (v: FormValues) =>
    save.mutate(
      { email: v.email, password: v.newPassword },
      {
        onSuccess: () => {
          onHide();
          toast.success('Utente modificato correttamente');
          toast.warning('Effettua di nuovo il login');
          void navigate({ to: '/login' });
        },
      },
    );

  return (
    <Modal show={show} onHide={onHide} backdrop="static">
      <Modal.Header>
        <Modal.Title>Profilo utente</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <form onSubmit={handleSubmit(onSubmit)} aria-label="Profilo utente" noValidate>
          <div className="mb-3">
            <label htmlFor="email" className="form-label">
              Email
            </label>
            <input
              id="email"
              type="text"
              autoComplete="username"
              className={`form-control${errors.email ? ' is-invalid' : ''}`}
              {...register('email', { required: 'Il campo email è obbligatorio' })}
            />
            {errors.email && <div className="invalid-feedback">{errors.email.message}</div>}
          </div>

          <div className="mb-3">
            <label htmlFor="newPassword" className="form-label">
              Nuova password
            </label>
            <input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              className={`form-control${errors.newPassword ? ' is-invalid' : ''}`}
              {...register('newPassword', {
                required: 'Il campo Nuova password è obbligatorio',
                // Without this, correcting newPassword leaves a stale mismatch error on
                // confirmPassword: RHF only revalidates the field that changed.
                deps: ['confirmPassword'],
              })}
            />
            {errors.newPassword && (
              <div className="invalid-feedback">{errors.newPassword.message}</div>
            )}
          </div>

          <div className="mb-3">
            <label htmlFor="confirmPassword" className="form-label">
              Conferma password
            </label>
            <input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              className={`form-control${errors.confirmPassword ? ' is-invalid' : ''}`}
              {...register('confirmPassword', {
                required: 'Il campo Conferma password è obbligatorio',
                validate: (value, values) =>
                  value === values.newPassword || 'Le password non coincidono',
              })}
            />
            {errors.confirmPassword && (
              <div className="invalid-feedback">{errors.confirmPassword.message}</div>
            )}
          </div>

          <div className="d-grid gap-2 d-sm-flex justify-content-sm-center mt-3 pb-3">
            <button type="submit" className="btn btn-primary" disabled={!isValid || save.isPending}>
              Salva
            </button>
            <button type="button" className="btn btn-primary" onClick={onHide}>
              Annulla
            </button>
          </div>
        </form>
      </Modal.Body>
    </Modal>
  );
};
