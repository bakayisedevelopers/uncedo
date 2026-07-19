import { SessionRatingPrompt as BaseSessionRatingPrompt } from '../student/SessionRatingPrompt';

export function SessionRatingPrompt({ role = 'customer', ...props }) {
  const serviceRole = role === 'customer' ? 'student' : role;
  return <BaseSessionRatingPrompt role={serviceRole} {...props} />;
}
