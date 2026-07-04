import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

function emitBridgeEvent(onBridgeMessage, payload) {
  onBridgeMessage?.({
    nativeEvent: {
      data: JSON.stringify(payload),
    },
  });
}

function normalizeVolumeLevel(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, (numeric + 2) / 12));
}

const CONTEXTUAL_STRINGS = [
  'Uncedo',
  'home cleaning',
  'grass cutting',
  'yard maintenance',
  'beauty',
  'barber',
  'body care',
  'car wash',
  'today',
  'tomorrow',
];

export const CustomerAiCallBridge = forwardRef(function CustomerAiCallBridge(
  {
    onBridgeMessage,
  },
  ref,
) {
  const onBridgeMessageRef = useRef(onBridgeMessage);
  const closedRef = useRef(false);
  const recognitionActiveRef = useRef(false);
  const listeningEnabledRef = useRef(false);
  const assistantPausedRef = useRef(true);
  const mutedRef = useRef(false);
  const restartTimerRef = useRef(null);
  const suppressAbortErrorRef = useRef(false);
  const lastCommittedTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');

  const dispatchEvent = (payload) => {
    emitBridgeEvent(onBridgeMessageRef.current, payload);
  };

  const traceBridge = (stage, detail = {}) => {
    dispatchEvent({
      type: 'log',
      payload: {
        message: `customer_bridge_${stage}`,
        detail,
      },
    });
  };

  useEffect(() => {
    onBridgeMessageRef.current = onBridgeMessage;
  }, [onBridgeMessage]);

  const clearRestartTimer = () => {
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  };

  const stopRecognition = (abort = false) => {
    clearRestartTimer();
    if (!recognitionActiveRef.current) {
      return;
    }
    try {
      if (abort) {
        suppressAbortErrorRef.current = true;
        ExpoSpeechRecognitionModule.abort();
      } else {
        ExpoSpeechRecognitionModule.stop();
      }
    } catch {}
  };

  const startRecognition = (reason = 'resume') => {
    if (
      closedRef.current
      || mutedRef.current
      || assistantPausedRef.current
      || !listeningEnabledRef.current
      || recognitionActiveRef.current
    ) {
      return;
    }

    clearRestartTimer();

    try {
      lastCommittedTranscriptRef.current = '';
      interimTranscriptRef.current = '';
      ExpoSpeechRecognitionModule.start({
        lang: 'en-ZA',
        interimResults: true,
        continuous: Platform.OS === 'android',
        addsPunctuation: true,
        maxAlternatives: 1,
        contextualStrings: CONTEXTUAL_STRINGS,
        iosTaskHint: 'dictation',
        androidIntentOptions: {
          EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS: 1500,
          EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS: 1000,
          EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS: 500,
        },
      });
      traceBridge('recognition_start_requested', { reason });
    } catch (error) {
      dispatchEvent({
        type: 'error',
        message: `Speech recognition failed to start: ${error?.message || 'Unknown error'}`,
      });
    }
  };

  const scheduleRecognitionRestart = (reason = 'restart', delayMs = 350) => {
    if (
      closedRef.current
      || mutedRef.current
      || assistantPausedRef.current
      || !listeningEnabledRef.current
    ) {
      return;
    }

    clearRestartTimer();
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      startRecognition(reason);
    }, delayMs);
  };

  const pauseListening = (reason = 'pause') => {
    listeningEnabledRef.current = false;
    assistantPausedRef.current = true;
    dispatchEvent({
      type: 'audio_state',
      payload: {
        audioInActive: false,
        isMuted: mutedRef.current,
      },
    });
    stopRecognition(true);
    dispatchEvent({
      type: 'log',
      payload: {
        message: 'customer_bridge_listening_paused',
        detail: { reason },
      },
    });
  };

  const resumeListening = (reason = 'resume') => {
    if (closedRef.current || mutedRef.current) {
      return;
    }
    listeningEnabledRef.current = true;
    assistantPausedRef.current = false;
    dispatchEvent({
      type: 'audio_state',
      payload: {
        audioInActive: false,
        isMuted: mutedRef.current,
      },
    });
    dispatchEvent({
      type: 'status',
      payload: {
        status: 'listening',
      },
    });
    dispatchEvent({
      type: 'log',
      payload: {
        message: 'customer_bridge_listening_resumed',
        detail: { reason },
      },
    });
    startRecognition(reason);
  };

  useImperativeHandle(ref, () => ({
    toggleMute() {
      mutedRef.current = !mutedRef.current;
      traceBridge('mute_toggled', {
        muted: mutedRef.current,
        recognitionActive: recognitionActiveRef.current,
      });
      if (mutedRef.current) {
        stopRecognition(true);
      } else if (listeningEnabledRef.current && !assistantPausedRef.current) {
        startRecognition('unmute');
      }
      dispatchEvent({
        type: 'audio_state',
        payload: {
          audioInActive: recognitionActiveRef.current && !mutedRef.current,
          isMuted: mutedRef.current,
        },
      });
    },
    pauseListening() {
      pauseListening('assistant_tts');
    },
    resumeListening() {
      resumeListening('assistant_tts_complete');
    },
    close() {
      closedRef.current = true;
      listeningEnabledRef.current = false;
      assistantPausedRef.current = true;
      clearRestartTimer();
      stopRecognition(true);
      recognitionActiveRef.current = false;
      traceBridge('closed', {});
    },
  }), []);

  useEffect(() => {
    closedRef.current = false;
    listeningEnabledRef.current = false;
    assistantPausedRef.current = true;
    mutedRef.current = false;
    recognitionActiveRef.current = false;
    lastCommittedTranscriptRef.current = '';
    interimTranscriptRef.current = '';

    dispatchEvent({ type: 'bridge_ready' });
    traceBridge('ready', {});

    const subscriptions = [
      ExpoSpeechRecognitionModule.addListener('start', () => {
        recognitionActiveRef.current = true;
        traceBridge('recognition_started', {});
        dispatchEvent({
          type: 'audio_state',
          payload: {
            audioInActive: true,
            isMuted: mutedRef.current,
          },
        });
      }),
      ExpoSpeechRecognitionModule.addListener('end', () => {
        recognitionActiveRef.current = false;
        traceBridge('recognition_ended', {});
        dispatchEvent({
          type: 'audio_state',
          payload: {
            audioInActive: false,
            isMuted: mutedRef.current,
          },
        });
        scheduleRecognitionRestart('speech_end_restart');
      }),
      ExpoSpeechRecognitionModule.addListener('speechstart', () => {
        traceBridge('speech_detected', {});
        dispatchEvent({
          type: 'audio_state',
          payload: {
            audioInActive: true,
            isMuted: mutedRef.current,
          },
        });
      }),
      ExpoSpeechRecognitionModule.addListener('speechend', () => {
        traceBridge('speech_completed', {});
        dispatchEvent({
          type: 'audio_state',
          payload: {
            audioInActive: false,
            isMuted: mutedRef.current,
          },
        });
      }),
      ExpoSpeechRecognitionModule.addListener('volumechange', (event) => {
        dispatchEvent({
          type: 'audio_level',
          payload: {
            direction: 'input',
            level: normalizeVolumeLevel(event?.value),
          },
        });
      }),
      ExpoSpeechRecognitionModule.addListener('result', (event) => {
        const transcript = String(event?.results?.[0]?.transcript || '').trim();
        if (!transcript) return;

        if (!event?.isFinal) {
          interimTranscriptRef.current = transcript;
          dispatchEvent({
            type: 'log',
            payload: {
              message: 'Speech partial result',
              detail: { transcript },
            },
          });
          traceBridge('speech_partial_result', { transcriptLength: transcript.length });
          return;
        }

        if (transcript === lastCommittedTranscriptRef.current) {
          return;
        }

        lastCommittedTranscriptRef.current = transcript;
        interimTranscriptRef.current = '';
        listeningEnabledRef.current = false;
        assistantPausedRef.current = true;
        traceBridge('speech_final_result', { transcriptLength: transcript.length });
        dispatchEvent({
          type: 'status',
          payload: {
            status: 'processing',
          },
        });
        dispatchEvent({
          type: 'audio_state',
          payload: {
            audioInActive: false,
            isMuted: mutedRef.current,
          },
        });
        dispatchEvent({
          type: 'customer_text_final',
          payload: {
            text: transcript,
            metadata: {
              source: 'speech_recognition',
              isFinal: true,
            },
          },
        });
        stopRecognition(true);
      }),
      ExpoSpeechRecognitionModule.addListener('error', (event) => {
        const code = String(event?.error || '').trim().toLowerCase();
        if (code === 'aborted' && suppressAbortErrorRef.current) {
          suppressAbortErrorRef.current = false;
          traceBridge('recognition_abort_suppressed', {});
          return;
        }

        const recoverable = ['no-speech', 'speech-timeout', 'busy', 'client', 'network'];
        if (recoverable.includes(code)) {
          traceBridge('recognition_recoverable_error', {
            code,
            message: event?.message || '',
          });
          dispatchEvent({
            type: 'log',
            payload: {
              message: 'Speech recognition recoverable error',
              detail: { code, message: event?.message || '' },
            },
          });
          recognitionActiveRef.current = false;
          scheduleRecognitionRestart(`speech_error_${code}`, 500);
          return;
        }

        dispatchEvent({
          type: 'error',
          message: `Speech recognition error: ${event?.message || code || 'Unknown error'}`,
        });
        traceBridge('recognition_fatal_error', {
          code,
          message: event?.message || '',
        });
      }),
    ];

    let cancelled = false;

    (async () => {
      try {
        const permissionResult = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (!permissionResult?.granted && !cancelled) {
          dispatchEvent({
            type: 'error',
            message: 'Speech recognition permission is required before starting the service call.',
          });
          return;
        }

        const recognitionAvailable = ExpoSpeechRecognitionModule.isRecognitionAvailable?.();
        if (recognitionAvailable === false && !cancelled) {
          dispatchEvent({
            type: 'error',
            message: 'Speech recognition is not available on this device.',
          });
          return;
        }

        if (cancelled) {
          return;
        }

        dispatchEvent({
          type: 'status',
          payload: {
            status: 'dialing',
          },
        });
      } catch (error) {
        if (cancelled) return;
        dispatchEvent({
          type: 'error',
          message: `Customer call bridge failed to initialize: ${error?.message || 'Unknown error'}`,
        });
      }
    })();

    return () => {
      cancelled = true;
      closedRef.current = true;
      listeningEnabledRef.current = false;
      assistantPausedRef.current = true;
      clearRestartTimer();
      stopRecognition(true);
      recognitionActiveRef.current = false;
      for (const subscription of subscriptions) {
        try {
          subscription?.remove?.();
        } catch {}
      }
    };
  }, []);

  return <View style={styles.hiddenWrap} />;
});

const styles = StyleSheet.create({
  hiddenWrap: {
    height: 1,
    opacity: 0,
    overflow: 'hidden',
    width: 1,
  },
});
