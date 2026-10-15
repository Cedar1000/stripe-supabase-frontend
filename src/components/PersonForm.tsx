import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { uploadPhoto } from '../lib/api';
import { datesFromDrafts, draftFromStored } from '../lib/dates';
import type { Gender, Person, PersonInput } from '../lib/types';
import { DateFields } from './DateFields';
import { Avatar, Modal } from './ui';

export function PersonForm({
  title,
  initial,
  familyId,
  parentId,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial?: Person;
  familyId: string;
  parentId: string | null;
  onCancel: () => void;
  onSubmit: (input: PersonInput) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [gender, setGender] = useState<Gender>(initial?.gender ?? 'male');
  const [birth, setBirth] = useState(draftFromStored(initial?.birth_date ?? null, initial?.birth_precision ?? null));
  const [deceased, setDeceased] = useState(initial?.is_deceased ?? false);
  const [death, setDeath] = useState(draftFromStored(initial?.death_date ?? null, initial?.death_precision ?? null));
  const [bio, setBio] = useState(initial?.bio ?? '');
  const [photoUrl, setPhotoUrl] = useState(initial?.photo_url ?? null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const preview = useMemo(() => (photoFile ? URL.createObjectURL(photoFile) : null), [photoFile]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const dates = datesFromDrafts(birth, deceased, death);
    if ('error' in dates) return setError(dates.error);

    setBusy(true);
    try {
      const photo = photoFile ? await uploadPhoto(familyId, photoFile) : photoUrl;
      await onSubmit({
        parent_id: parentId,
        name: name.trim(),
        gender,
        photo_url: photo,
        ...dates,
        is_deceased: deceased,
        bio: bio.trim(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  const shown = preview ?? photoUrl;

  return (
    <Modal title={title} onClose={onCancel}>
      <form className="form" onSubmit={submit}>
        <div className="photo-field">
          <Avatar person={{ name: name || '?', photo_url: shown, gender, is_deceased: false }} size={88} />
          <div className="photo-actions">
            <label className="button button-secondary">
              {shown ? 'Change picture' : 'Add picture'}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} />
            </label>
            {shown && (
              <button type="button" className="button button-ghost" onClick={() => { setPhotoFile(null); setPhotoUrl(null); }}>
                Remove
              </button>
            )}
          </div>
        </div>

        <label>
          Full name
          <input required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        <fieldset className="radio-row">
          <legend>Sex</legend>
          <label><input type="radio" name="gender" checked={gender === 'male'} onChange={() => setGender('male')} /> Male</label>
          <label><input type="radio" name="gender" checked={gender === 'female'} onChange={() => setGender('female')} /> Female</label>
        </fieldset>

        <DateFields legend="Date of birth" value={birth} onChange={setBirth}
          hint="Give as much as you know — year only, month and year, or the full date." />

        <label className="checkbox">
          <input type="checkbox" checked={deceased} onChange={(e) => setDeceased(e.target.checked)} /> Deceased
        </label>

        {deceased && (
          <DateFields legend="Date of death" value={death} onChange={setDeath} hint="Leave blank if unknown." />
        )}

        <label>
          A little write-up
          <textarea rows={4} maxLength={1500} value={bio} onChange={(e) => setBio(e.target.value)}
            placeholder="Occupation, where they lived, a favourite memory…" />
        </label>

        {error && <p className="form-error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="button button-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'OK'}</button>
        </div>
      </form>
    </Modal>
  );
}
