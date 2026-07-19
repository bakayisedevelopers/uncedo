import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFirebaseClients } from '../firebase/config';
import { SOUTH_AFRICAN_SUBJECTS, normalizeSubjectList } from '../constants/subjects';

export function useSubjectCatalog() {
  const [subjectNames, setSubjectNames] = useState([]);
  const subjectOptions = useMemo(
    () => subjectNames.map((subject) => ({ value: subject, label: subject })),
    [subjectNames],
  );

  const allowedSet = useMemo(
    () => new Set(SOUTH_AFRICAN_SUBJECTS.map((subject) => String(subject).trim().toLowerCase())),
    [],
  );

  useEffect(() => {
    const { db } = getFirebaseClients();
    const unsubscribe = onSnapshot(
      doc(db, 'system', 'subjects'),
      (snapshot) => {
        if (!snapshot.exists()) {
          setSubjectNames([]);
          return;
        }

        const names = normalizeSubjectList(snapshot.data()?.subjectNames || [])
          .filter((name) => allowedSet.has(String(name).trim().toLowerCase()));
        setSubjectNames(names);
      },
      () => setSubjectNames([]),
    );

    return () => unsubscribe();
  }, [allowedSet]);

  return {
    subjectNames,
    subjectOptions,
  };
}
