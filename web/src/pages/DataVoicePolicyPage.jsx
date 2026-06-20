import LegalPageShell, { LegalSection } from '../components/legal/LegalPageShell';

export default function DataVoicePolicyPage() {
  return (
    <LegalPageShell
      title="Data, Voice, and Session Handling Policy"
      updatedAt="June 6, 2026"
      intro="This policy gives extra detail about how Parakleo handles live session data, microphone audio, screen sharing, attachments, extracted text, diagnostics, and safety review."
      contact="privacy@parakleo.app"
    >
      <LegalSection title="1. Microphone and voice handling">
        <p>
          Parakleo sessions may request microphone access so students and tutors can speak during class. Audio is used to
          provide the live session. Parakleo does not intentionally record, store, or transcribe live voice audio unless a
          future recording or transcription feature is introduced with clear notice and any required consent. Users can
          mute audio in the session or deny microphone permission, but doing so may prevent the class from working properly.
        </p>
      </LegalSection>

      <LegalSection title="2. WebRTC connection data">
        <p>
          To connect calls, Parakleo may process WebRTC offers, answers, ICE candidates, connection state, relay usage,
          reconnect attempts, and timestamps. This data is used for session connection, troubleshooting, abuse prevention,
          and dispute review. It is not intended to reveal lesson content.
        </p>
      </LegalSection>

      <LegalSection title="3. Screen sharing">
        <p>
          Tutors may share a screen during a session. Tutors are responsible for choosing the correct window or screen and
          avoiding disclosure of private information. Students must not capture, distribute, or misuse shared screen content
          without permission. Parakleo may process screen sharing state and related diagnostics to operate the feature.
        </p>
      </LegalSection>

      <LegalSection title="4. Attachments and OCR">
        <p>
          Students may upload images or files related to a tutoring request. Parakleo may use OCR or similar extraction
          tools to read question text from attachments and make it available for request matching, tutor preparation, session
          delivery, quality review, and dispute handling. Users must not upload content they do not have the right to share.
        </p>
      </LegalSection>

      <LegalSection title="5. Safety, moderation, and disputes">
        <p>
          Parakleo may review account data, request details, session metadata, uploaded content, extracted text, messages,
          payment records, ratings, and support history when investigating safety concerns, complaints, refunds, tutor
          quality, fraud, chargebacks, or policy violations.
        </p>
      </LegalSection>

      <LegalSection title="6. User responsibilities">
        <p>
          Users must join sessions from a safe environment, avoid sharing unnecessary personal information, respect privacy,
          keep login details secure, avoid recording other users without permission, and report unsafe or abusive behavior
          promptly.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
