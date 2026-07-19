import { useEffect, useMemo, useState } from 'react';
import {
  subscribeToRequestById,
  subscribeToStudentRequests,
  subscribeToTutorAcceptedRequests,
  subscribeToTutorAvailableRequests,
} from '../services/classRequestService';
import { REQUEST_STATUSES } from '../utils/requestStatus';

export function useStudentRequests(studentId) {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!studentId) {
      setRequests([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsub = subscribeToStudentRequests(studentId, (items) => {
      setRequests(items);
      setIsLoading(false);
    });

    return () => unsub?.();
  }, [studentId]);

  return { requests, isLoading };
}

export function useStudentRequest(requestId) {
  return useClassRequest(requestId);
}

export function useClassRequest(requestId) {
  const [request, setRequest] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!requestId) {
      setRequest(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const unsub = subscribeToRequestById(requestId, (item) => {
      setRequest(item);
      setIsLoading(false);
    });
    return () => unsub?.();
  }, [requestId]);

  return { request, isLoading };
}

export function useTutorAvailableRequests(tutorId) {
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    if (!tutorId) {
      setRequests([]);
      setIsLoading(false);
      return;
    }

    const unsub = subscribeToTutorAvailableRequests(tutorId, (items) => {
      setRequests(items);
      setIsLoading(false);
    });

    return () => unsub?.();
  }, [tutorId]);

  return { requests, isLoading };
}

export function useTutorAcceptedRequests(tutorId) {
  const [classes, setClasses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!tutorId) {
      setClasses([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsub = subscribeToTutorAcceptedRequests(tutorId, (items) => {
      setClasses(items);
      setIsLoading(false);
    });

    return () => unsub?.();
  }, [tutorId]);

  const upcoming = useMemo(
    () =>
      classes.filter((item) =>
        [REQUEST_STATUSES.ACCEPTED, REQUEST_STATUSES.WAITING_STUDENT, REQUEST_STATUSES.IN_PROGRESS, REQUEST_STATUSES.IN_SESSION].includes(item.status),
      ),
    [classes],
  );

  return { classes, upcoming, isLoading };
}
