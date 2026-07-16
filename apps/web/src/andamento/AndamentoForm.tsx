import { Controller, useForm, useWatch } from 'react-hook-form';
import type { AndamentoInput, TipoSpesa } from '@gc/shared-types';
import type { FormValues } from './prefills';

type Props = {
  titolo: string;
  initial: FormValues;
  tipiSpesa: TipoSpesa[];
  submitting?: boolean;
  onSubmit: (input: AndamentoInput) => void;
  onCancel: () => void;
};

const toInput = (v: FormValues): AndamentoInput => ({
  ...(v.id != null ? { id: v.id } : {}),
  giorno: v.giorno,
  descrizione: v.descrizione,
  costo: Number(v.costo),
  tipoSpesa: { id: Number(v.tipoSpesaId) },
});

// Computed directly from the watched values (not RHF's formState.isValid, which stays
// stale until the first async validation pass — wrong for a form opened already-valid,
// e.g. editing an existing Andamento with no field touched yet).
// descrizione uses !== '' (not .trim()) to match RHF's `required` validator, which
// does not trim — otherwise a whitespace-only value would disable Salva with no inline
// error. Parity with the legacy Angular Validators.required (also no trim).
const isFormValid = (v: FormValues): boolean =>
  v.giorno !== '' &&
  v.descrizione !== '' &&
  v.tipoSpesaId !== '' &&
  typeof v.costo === 'number' &&
  v.costo >= 0.01;

// Edit/create form (native inputs). Rendered inside a Modal by AndamentoList.
// Mounted fresh per open, so defaultValues carry the right prefill — no reset needed.
export const AndamentoForm = ({
  titolo,
  initial,
  tipiSpesa,
  submitting,
  onSubmit,
  onCancel,
}: Props) => {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({ mode: 'onChange', defaultValues: initial });
  const valid = useWatch({ control, defaultValue: initial, compute: isFormValid });

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(toInput(v)))} aria-label={titolo} noValidate>
      <div className="row">
        <div className="col-sm-6 mb-3">
          <label htmlFor="giorno" className="form-label">
            Giorno *
          </label>
          <input
            id="giorno"
            type="date"
            className={`form-control${errors.giorno ? ' is-invalid' : ''}`}
            {...register('giorno', { required: 'Il campo giorno è obbligatorio' })}
          />
          {errors.giorno && <div className="invalid-feedback">{errors.giorno.message}</div>}
        </div>

        <div className="col-sm-6 mb-3">
          <label htmlFor="tipoSpesa" className="form-label">
            Tipo spesa *
          </label>
          <Controller
            name="tipoSpesaId"
            control={control}
            rules={{ required: 'Il campo tipo spesa è obbligatorio' }}
            render={({ field }) => (
              // Controller (not register) — RHF's register+defaultValues doesn't reliably
              // apply the initial selected <option> on a native <select> (ref-timing gotcha).
              <select
                id="tipoSpesa"
                name={field.name}
                ref={field.ref}
                value={field.value}
                onBlur={field.onBlur}
                onChange={(e) =>
                  field.onChange(e.target.value === '' ? '' : Number(e.target.value))
                }
                className={`form-select${errors.tipoSpesaId ? ' is-invalid' : ''}`}
              >
                <option value="">-- seleziona --</option>
                {tipiSpesa.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.descrizione}
                  </option>
                ))}
              </select>
            )}
          />
          {errors.tipoSpesaId && (
            <div className="invalid-feedback">{errors.tipoSpesaId.message}</div>
          )}
        </div>

        <div className="col-sm-6 mb-3">
          <label htmlFor="descrizione" className="form-label">
            Descrizione *
          </label>
          <input
            id="descrizione"
            type="text"
            className={`form-control${errors.descrizione ? ' is-invalid' : ''}`}
            {...register('descrizione', { required: 'Il campo descrizione è obbligatorio' })}
          />
          {errors.descrizione && (
            <div className="invalid-feedback">{errors.descrizione.message}</div>
          )}
        </div>

        <div className="col-sm-6 mb-3">
          <label htmlFor="costo" className="form-label">
            Costo *
          </label>
          <input
            id="costo"
            type="number"
            step="0.01"
            min="0.01"
            className={`form-control${errors.costo ? ' is-invalid' : ''}`}
            {...register('costo', {
              required: 'Il campo costo è obbligatorio',
              min: { value: 0.01, message: 'Il campo costo deve essere maggiore di zero' },
              valueAsNumber: true,
            })}
          />
          {errors.costo && <div className="invalid-feedback">{errors.costo.message}</div>}
        </div>
      </div>

      <div className="d-grid gap-2 d-sm-flex justify-content-sm-center mt-3">
        <button type="submit" className="btn btn-primary" disabled={!valid || submitting}>
          Salva
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </form>
  );
};
