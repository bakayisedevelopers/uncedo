import { useEffect, useState } from 'react';
import { subscribeToStudentSessions, subscribeToTutorSessions } from '../services/sessionService';

export function useStudentSessions(studentId) {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!studentId) {
      setSessions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsub = subscribeToStudentSessions(studentId, (items) => {
      setSessions(items);
      setIsLoading(false);
    });

    return () => unsub?.();
  }, [studentId]);

  return { sessions, isLoading };
}

export function useTutorSessions(tutorId) {
  const [sessions, setSessions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tutorId) {
      setSessions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsub = subscribeToTutorSessions(tutorId, (items) => {
      setSessions(items);
      setIsLoading(false);
    });

    return () => unsub?.();
  }, [tutorId]);

  return { sessions, isLoading };
}
