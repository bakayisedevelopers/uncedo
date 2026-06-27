import { getFirebaseClients } from '../firebase/config';
import { debugLog } from '../utils/devLogger';

const DEFAULT_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const CONNECTION_TIMEOUT_MS = 12000;
const MAX_ICE_RESTART_ATTEMPTS = 2;

function buildConfig(iceServers, { forceRelayOnly = false } = {}) {
  return {
    iceServers: Array.isArray(iceServers) && iceServers.length ? iceServers : DEFAULT_ICE_SERVERS,
    iceCandidatePoolSize: 4,
    ...(forceRelayOnly ? { iceTransportPolicy: 'relay' } : {}),
  };
}

function getCandidateType(candidateText = '') {
  const match = candidateText.match(/\btyp\s([a-z]+)/i);
  return match?.[1]?.toLowerCase() || 'unknown';
}

function serializeSessionDescription(description) {
  if (!description) return null;
  return {
    type: description.type,
    sdp: description.sdp,
  };
}

function getMediaErrorMessage(error) {
  const name = error?.name || 'UnknownError';
  const message = error?.message || 'Unknown media device error.';

  if (name === 'NotAllowedError') {
    return 'Microphone permission was denied. Please allow access and retry.';
  }

  if (name === 'NotFoundError') {
    return 'No microphone device was found.';
  }

  if (name === 'NotReadableError') {
    return 'Your microphone is already being used by another application.';
  }

  if (name === 'OverconstrainedError') {
    return 'The requested microphone settings are not supported on this device.';
  }

  return message;
}

async function getLocalMediaStream() {
  const audioOnlyConstraints = {
    audio: true,
    video: false,
  };

  try {
    debugLog('webrtcService', 'Requesting local media (audio only).', {
      constraints: audioOnlyConstraints,
    });

    const stream = await navigator.mediaDevices.getUserMedia(audioOnlyConstraints);

    debugLog('webrtcService', 'Local media acquired (audio only).', {
      audioTracks: stream.getAudioTracks().length,
      videoTracks: stream.getVideoTracks().length,
    });

    return {
      stream,
      mode: 'audio_only',
    };
  } catch (error) {
    debugLog('webrtcService', 'Failed to get local media (audio only).', {
      name: error?.name || null,
      message: error?.message || null,
    });

    throw new Error(getMediaErrorMessage(error));
  }
}

async function logSelectedPair(pc) {
  try {
    const stats = await pc.getStats();
    let selectedPair = null;

    stats.forEach((report) => {
      if (report.type === 'transport' && report.selectedCandidatePairId) {
        selectedPair = stats.get(report.selectedCandidatePairId) || selectedPair;
      }
      if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded') {
        selectedPair = selectedPair || report;
      }
    });

    if (!selectedPair) {
      debugLog('webrtcService', 'Connected, but selected ICE pair is unavailable.');
      return;
    }

    const local = stats.get(selectedPair.localCandidateId);
    const remote = stats.get(selectedPair.remoteCandidateId);
    const relayUsed = local?.candidateType === 'relay' || remote?.candidateType === 'relay';

    debugLog('webrtcService', 'Selected ICE candidate pair.', {
      relayUsed,
      localType: local?.candidateType || null,
      remoteType: remote?.candidateType || null,
      localProtocol: local?.protocol || null,
      remoteProtocol: remote?.protocol || null,
    });
  } catch (error) {
    debugLog('webrtcService', 'Failed to inspect selected ICE candidate pair.', {
      message: error.message,
    });
  }
}

async function addCandidate(addDoc, candidateCollectionRef, candidate) {
  await addDoc(candidateCollectionRef, {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment || null,
    createdAt: Date.now(),
  });
}

function hydrateCandidate(data) {
  return new RTCIceCandidate({
    candidate: data.candidate,
    sdpMid: data.sdpMid,
    sdpMLineIndex: data.sdpMLineIndex,
    usernameFragment: data.usernameFragment || undefined,
  });
}

async function clearCandidateCollection(getDocs, deleteDoc, collectionRef) {
  const snapshot = await getDocs(collectionRef);
  await Promise.all(snapshot.docs.map((item) => deleteDoc(item.ref)));
}

export async function createWebRtcSessionController({
  sessionId,
  role,
  currentUserId,
  iceServers,
  forceRelayOnly = false,
  onRemoteStream,
  onRemoteScreenStream,
  onLocalStream,
  onConnectionMessage,
  onNetworkFailure,
  onSessionState,
  onScreenShareStateChange,
}) {
  const clients = await getFirebaseClients();
  if (!clients) {
    throw new Error('Realtime calls require Firebase configuration.');
  }

  const { db, firestoreModule } = clients;
  const {
    doc,
    collection,
    addDoc,
    getDocs,
    deleteDoc,
    getDoc,
    onSnapshot,
    setDoc,
  } = firestoreModule;

  const sessionRef = doc(db, 'sessions', sessionId);
  const tutorCandidatesRef = collection(db, 'sessions', sessionId, 'webrtcTutorCandidates');
  const studentCandidatesRef = collection(db, 'sessions', sessionId, 'webrtcStudentCandidates');
  const restartCollectionRef = collection(db, 'sessions', sessionId, 'webrtcRestartRequests');

  const resolvedConfig = buildConfig(iceServers, { forceRelayOnly });

  debugLog('webrtcService', 'Resolved ICE server config.', {
    forceRelayOnly,
    iceTransportPolicy: resolvedConfig.iceTransportPolicy || 'all',
    servers: resolvedConfig.iceServers.map((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      const hasTurnUrl = urls.some(
        (url) =>
          typeof url === 'string'
          && (url.startsWith('turn:') || url.startsWith('turns:')),
      );
      return {
        urls,
        hasTurnUrl,
        hasUsername: Boolean(server.username),
        hasCredential: Boolean(server.credential),
        credentialType: server.credentialType || null,
        usernamePreview: server.username ? `${String(server.username).slice(0, 8)}...` : null,
      };
    }),
  });

  const resolvedIceUrls = resolvedConfig.iceServers.flatMap((entry) => {
    if (!entry?.urls) return [];
    return Array.isArray(entry.urls) ? entry.urls : [entry.urls];
  });

  debugLog('webrtcService', 'Creating RTCPeerConnection with ICE servers.', {
    forceRelayOnly,
    urls: resolvedIceUrls,
  });

  const discoveredCandidateTypes = new Set();
  let relayCandidateDiscovered = false;
  const pendingRemoteCandidates = [];
  const pc = new RTCPeerConnection(resolvedConfig);

  let reconnectAttempts = 0;
  let isClosed = false;
  let connectTimer = null;
  let activeScreenStream = null;
  let latestOfferRevision = 0;
  let latestAppliedAnswerSdp = null;
  let isLocalScreenSharing = false;
  let isRemoteScreenSharing = false;
  let currentRemoteScreenTrackId = null;
  let lastKnownRemoteScreenTrack = null;
  const unsubscribers = [];

  async function flushPendingRemoteCandidates() {
    if (!pc.remoteDescription) return;
    if (!pendingRemoteCandidates.length) return;

    debugLog('webrtcService', 'Flushing queued remote ICE candidates.', {
      count: pendingRemoteCandidates.length,
    });

    while (pendingRemoteCandidates.length > 0) {
      const candidate = pendingRemoteCandidates.shift();
      try {
        await pc.addIceCandidate(candidate);
      } catch (error) {
        debugLog('webrtcService', 'Failed to flush queued remote ICE candidate.', {
          message: error.message,
        });
      }
    }
  }

  pc.onicecandidateerror = (event) => {
    debugLog('webrtcService', 'ICE candidate error.', {
      url: event.url || null,
      errorCode: event.errorCode || null,
      errorText: event.errorText || null,
      address: event.address || null,
      port: event.port || null,
    });
  };

  const { stream: localStream, mode: localMediaMode } = await getLocalMediaStream();

  debugLog('webrtcService', 'Using local media mode.', {
    mode: localMediaMode,
  });

  onLocalStream?.(localStream);

  const audioTrack = localStream.getAudioTracks()[0] || null;

  if (audioTrack) {
    pc.addTrack(audioTrack, localStream);
  }

  const screenTransceiver = pc.addTransceiver('video', {
    direction: role === 'tutor' ? 'sendonly' : 'recvonly',
  });

  const remoteCameraStream = new MediaStream();
  const remoteScreenStream = new MediaStream();

  const setConnectionTimeout = () => {
    if (connectTimer) clearTimeout(connectTimer);
    connectTimer = setTimeout(() => {
      if (pc.connectionState === 'connected') return;
      onNetworkFailure?.('Your network is blocking the connection. Please retry or switch network.');
    }, CONNECTION_TIMEOUT_MS);
  };

  const emitScreenShareState = () => {
    onScreenShareStateChange?.({
      local: isLocalScreenSharing,
      remote: isRemoteScreenSharing,
    });
  };

  const updateScreenShareDocState = async (active) => {
    debugLog('webrtcService', '[parakleo:screen:tutor] updateScreenShareDocState write.', {
      active,
    });
    const sessionSnap = await getDoc(sessionRef);
    const existing = sessionSnap.data()?.webrtc || {};

    await setDoc(
      sessionRef,
      {
        webrtc: {
          ...existing,
          screenShare: {
            active,
            by: active ? role : null,
            updatedAt: Date.now(),
          },
        },
        updatedAt: Date.now(),
      },
      { merge: true },
    );
  };

  const publishUpdatedOffer = async (status = 'connecting') => {
    const sessionSnap = await getDoc(sessionRef);
    const existing = sessionSnap.data()?.webrtc || {};
    const previousRevision = Number(existing.offerRevision || 0);
    const nextRevision = Number(existing.offerRevision || 0) + 1;
    debugLog('webrtcService', '[parakleo:screen:tutor] publishUpdatedOffer start.', {
      status,
      offerRevisionBefore: previousRevision,
      offerRevisionAfter: nextRevision,
      screenShareActive: isLocalScreenSharing,
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await setDoc(
      sessionRef,
      {
        webrtc: {
          offer: serializeSessionDescription(offer),
          answer: null,
          offerRevision: nextRevision,
          status,
        },
        updatedAt: Date.now(),
      },
      { merge: true },
    );

    latestOfferRevision = nextRevision;

    debugLog('webrtcService', 'Published updated WebRTC offer.', {
      offerRevision: nextRevision,
      status,
    });
  };

  const clearRemoteScreenStream = () => {
    const hadRemoteScreenStream =
      Boolean(remoteScreenStream) && remoteScreenStream.getTracks().length > 0;
    debugLog('webrtcService', '[parakleo:screen:student] clearRemoteScreenStream run.', {
      hadRemoteScreenStream,
      lastKnownRemoteScreenTrackId: lastKnownRemoteScreenTrack?.id || null,
    });

    remoteScreenStream.getTracks().forEach((track) => {
      remoteScreenStream.removeTrack(track);
    });

    currentRemoteScreenTrackId = null;
    isRemoteScreenSharing = false;
    onRemoteScreenStream?.(null);
    emitScreenShareState();
  };

  const attachRemoteScreenReceiverTrack = () => {
    debugLog('webrtcService', '[parakleo:screen:student] attachRemoteScreenReceiverTrack called.', {
      role,
      lastKnownRemoteScreenTrackId: lastKnownRemoteScreenTrack?.id || null,
      lastKnownRemoteScreenTrackMuted: lastKnownRemoteScreenTrack?.muted ?? null,
      lastKnownRemoteScreenTrackReadyState: lastKnownRemoteScreenTrack?.readyState || null,
    });

    if (role !== 'student') return;

    const receiverTrack = lastKnownRemoteScreenTrack;
    if (!receiverTrack) {
      debugLog('webrtcService', '[parakleo:screen:student] No last known remote screen track available yet.');
      return;
    }

    debugLog('webrtcService', 'Attached screen receiver track.', {
      id: receiverTrack.id,
      kind: receiverTrack.kind,
      muted: receiverTrack.muted,
      readyState: receiverTrack.readyState,
    });

    const existingVideoTrack = remoteScreenStream.getVideoTracks()[0] || null;
    const shouldReplaceTrack =
      !existingVideoTrack || existingVideoTrack.id !== receiverTrack.id;

    if (shouldReplaceTrack) {
      remoteScreenStream.getTracks().forEach((track) => {
        remoteScreenStream.removeTrack(track);
      });
      remoteScreenStream.addTrack(receiverTrack);
      currentRemoteScreenTrackId = receiverTrack.id;
    }

    const publishAttachedScreen = () => {
      const videoTrack = remoteScreenStream.getVideoTracks()[0] || null;
      const hasTrack =
        Boolean(videoTrack)
        && videoTrack.readyState === 'live'
        && !receiverTrack.muted;

      debugLog('webrtcService', '[parakleo:screen:student] helper publishAttachedScreen.', {
        receiverTrackId: receiverTrack.id,
        receiverMuted: receiverTrack.muted,
        receiverReadyState: receiverTrack.readyState,
        streamTrackIds: remoteScreenStream.getTracks().map((track) => track.id),
        streamVideoTrackIds: remoteScreenStream.getVideoTracks().map((track) => track.id),
        hasTrack,
      });

      isRemoteScreenSharing = hasTrack;
      onRemoteScreenStream?.(hasTrack ? remoteScreenStream : null);
      emitScreenShareState();
    };

    const handleUnmute = () => {
      debugLog('webrtcService', 'Remote screen receiver track unmuted.', {
        id: receiverTrack.id,
        readyState: receiverTrack.readyState,
      });
      publishAttachedScreen();
    };

    const handleMute = () => {
      debugLog('webrtcService', 'Remote screen receiver track muted.', {
        id: receiverTrack.id,
        readyState: receiverTrack.readyState,
      });

      isRemoteScreenSharing = false;
      onRemoteScreenStream?.(null);
      emitScreenShareState();
    };

    const handleEnded = () => {
      remoteScreenStream.getTracks().forEach((track) => {
        if (track.id === receiverTrack.id || track.readyState === 'ended') {
          remoteScreenStream.removeTrack(track);
        }
      });

      debugLog('webrtcService', 'Remote screen receiver track ended.', {
        id: receiverTrack.id,
        readyState: receiverTrack.readyState,
      });

      if (lastKnownRemoteScreenTrack?.id === receiverTrack.id) {
        lastKnownRemoteScreenTrack = null;
      }

      currentRemoteScreenTrackId = null;
      isRemoteScreenSharing = false;
      onRemoteScreenStream?.(null);
      emitScreenShareState();
    };

    receiverTrack.onunmute = handleUnmute;
    receiverTrack.onmute = handleMute;
    receiverTrack.onended = handleEnded;

    if (!receiverTrack.muted) {
      publishAttachedScreen();
    } else {
      debugLog(
        'webrtcService',
        '[parakleo:screen:student] helper attach deferred publish because receiver is muted.',
        {
          receiverTrackId: receiverTrack.id,
          receiverReadyState: receiverTrack.readyState,
        },
      );
    }
  };

  pc.ontrack = (event) => {
    const incomingTrack = event.track;
    const incomingMid = event.transceiver?.mid;
    const screenMid = screenTransceiver?.mid;

    debugLog('webrtcService', 'ontrack fired.', {
      kind: incomingTrack.kind,
      incomingMid,
      screenMid,
      trackId: incomingTrack.id,
      muted: incomingTrack.muted,
      readyState: incomingTrack.readyState,
    });
    debugLog('webrtcService', '[parakleo:screen:student] ontrack event.', {
      kind: incomingTrack.kind,
      trackId: incomingTrack.id,
      readyState: incomingTrack.readyState,
      muted: incomingTrack.muted,
      streamCount: event.streams?.length || 0,
      mid: incomingMid || null,
    });

    if (incomingTrack.kind !== 'video' && incomingTrack.kind !== 'audio') return;

    if (role === 'student' && incomingTrack.kind === 'video') {
      debugLog('webrtcService', '[parakleo:screen:student] ontrack video classification.', {
        treatedAsRemoteScreenTrack: true,
        trackId: incomingTrack.id,
      });

      lastKnownRemoteScreenTrack = incomingTrack;

      const alreadyExists = remoteScreenStream.getTracks().some((track) => track.id === incomingTrack.id);
      if (!alreadyExists) {
        const hadPreviousTrack = remoteScreenStream.getTracks().length > 0;
        if (hadPreviousTrack) {
          debugLog('webrtcService', '[parakleo:screen:student] replacing previous remote screen stream.', {
            previousTrackIds: remoteScreenStream.getTracks().map((track) => track.id),
            nextTrackId: incomingTrack.id,
          });
        }
        remoteScreenStream.getTracks().forEach((track) => remoteScreenStream.removeTrack(track));
        remoteScreenStream.addTrack(incomingTrack);
      }

      currentRemoteScreenTrackId = incomingTrack.id;

      const publishScreenState = () => {
        const hasUsableTrack =
          incomingTrack.readyState === 'live' && !incomingTrack.muted;

        if (hasUsableTrack) {
          const existingTrackIds = remoteScreenStream.getTracks().map((track) => track.id);
          const alreadyHasIncomingTrack = existingTrackIds.includes(incomingTrack.id);

          if (!alreadyHasIncomingTrack || remoteScreenStream.getVideoTracks().length === 0) {
            remoteScreenStream.getTracks().forEach((track) => {
              remoteScreenStream.removeTrack(track);
            });
            remoteScreenStream.addTrack(incomingTrack);
          }
        }

        isRemoteScreenSharing = hasUsableTrack;
        debugLog('webrtcService', '[parakleo:screen:student] onRemoteScreenStream call.', {
          value: hasUsableTrack ? 'stream' : 'null',
          trackId: incomingTrack.id,
          streamTrackIds: remoteScreenStream.getTracks().map((track) => track.id),
          streamVideoTrackIds: remoteScreenStream.getVideoTracks().map((track) => track.id),
        });
        onRemoteScreenStream?.(hasUsableTrack ? remoteScreenStream : null);
        emitScreenShareState();
      };

      incomingTrack.onunmute = () => {
        debugLog('webrtcService', '[parakleo:screen:student] track unmute.', {
          id: incomingTrack.id,
          readyState: incomingTrack.readyState,
        });
        publishScreenState();
      };

      incomingTrack.onmute = () => {
        debugLog('webrtcService', '[parakleo:screen:student] track mute.', {
          id: incomingTrack.id,
          readyState: incomingTrack.readyState,
        });
        isRemoteScreenSharing = false;
        debugLog('webrtcService', '[parakleo:screen:student] onRemoteScreenStream call.', {
          value: 'null',
          trackId: incomingTrack.id,
        });
        onRemoteScreenStream?.(null);
        emitScreenShareState();
      };

      incomingTrack.onended = () => {
        debugLog('webrtcService', '[parakleo:screen:student] track ended.', {
          id: incomingTrack.id,
          readyState: incomingTrack.readyState,
        });

        remoteScreenStream.getTracks().forEach((track) => {
          if (track.id === incomingTrack.id || track.readyState === 'ended') {
            remoteScreenStream.removeTrack(track);
          }
        });

        if (lastKnownRemoteScreenTrack?.id === incomingTrack.id) {
          lastKnownRemoteScreenTrack = null;
        }

        currentRemoteScreenTrackId = null;
        isRemoteScreenSharing = false;
        debugLog('webrtcService', '[parakleo:screen:student] onRemoteScreenStream call.', {
          value: 'null',
          trackId: incomingTrack.id,
        });
        onRemoteScreenStream?.(null);
        emitScreenShareState();
      };

      publishScreenState();
      return;
    };

    const alreadyExists = remoteCameraStream.getTracks().some((track) => track.id === incomingTrack.id);
    if (!alreadyExists) {
      remoteCameraStream.addTrack(incomingTrack);
      onRemoteStream?.(remoteCameraStream);
    };

    incomingTrack.addEventListener('ended', () => {
      remoteCameraStream.getTracks().forEach((track) => {
        if (track.readyState === 'ended') {
          remoteCameraStream.removeTrack(track);
        }
      });
      onRemoteStream?.(remoteCameraStream);
    });
  };

  pc.onicecandidate = async (event) => {
    if (!event.candidate) return;

    const type = getCandidateType(event.candidate.candidate);
    discoveredCandidateTypes.add(type);
    if (type === 'relay') relayCandidateDiscovered = true;

    debugLog('webrtcService', 'Local ICE candidate discovered.', {
      type,
      protocol: event.candidate.protocol || null,
      discoveredTypes: Array.from(discoveredCandidateTypes),
    });

    const destination = role === 'tutor' ? tutorCandidatesRef : studentCandidatesRef;
    await addCandidate(addDoc, destination, event.candidate);
  };

  pc.onconnectionstatechange = () => {
    onSessionState?.(pc.connectionState);
    debugLog('webrtcService', 'connectionState changed.', { state: pc.connectionState });

    if (pc.connectionState === 'connected') {
      if (forceRelayOnly) {
        debugLog('webrtcService', 'Relay-only debug result.', {
          relayCandidateDiscovered,
          discoveredTypes: Array.from(discoveredCandidateTypes),
        });
      }
      onConnectionMessage?.('Connected');
      logSelectedPair(pc);
      if (connectTimer) clearTimeout(connectTimer);
      return;
    }

    if (pc.connectionState === 'connecting') {
      onConnectionMessage?.('Connecting…');
      return;
    }

    if (['failed', 'disconnected'].includes(pc.connectionState)) {
      if (forceRelayOnly && !relayCandidateDiscovered) {
        debugLog('webrtcService', 'TURN failure diagnostic (relay-only mode).', {
          message: 'No relay candidates were discovered before connection failure.',
          discoveredTypes: Array.from(discoveredCandidateTypes),
          urls: resolvedIceUrls,
        });
      }
      onConnectionMessage?.('Reconnecting…');
    }
  };

  pc.oniceconnectionstatechange = async () => {
    debugLog('webrtcService', 'iceConnectionState changed.', { state: pc.iceConnectionState });

    if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
      onConnectionMessage?.('Connected');
      if (connectTimer) clearTimeout(connectTimer);
      return;
    }

    if (!['failed', 'disconnected'].includes(pc.iceConnectionState)) return;

    if (reconnectAttempts >= MAX_ICE_RESTART_ATTEMPTS) {
      if (forceRelayOnly && !relayCandidateDiscovered) {
        debugLog('webrtcService', 'TURN failure diagnostic (relay-only retries exhausted).', {
          discoveredTypes: Array.from(discoveredCandidateTypes),
          urls: resolvedIceUrls,
        });
      }
      onNetworkFailure?.('Your network is blocking the connection. Please retry or switch network.');
      return;
    }

    reconnectAttempts += 1;

    if (role === 'tutor') {
      const sessionSnap = await getDoc(sessionRef);
      const revision = Number(sessionSnap.data()?.webrtc?.offerRevision || 0) + 1;

      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);

      await clearCandidateCollection(getDocs, deleteDoc, tutorCandidatesRef);
      await clearCandidateCollection(getDocs, deleteDoc, studentCandidatesRef);

      await setDoc(
        sessionRef,
        {
          webrtc: {
            offer: serializeSessionDescription(offer),
            answer: null,
            offerRevision: revision,
            lastRestartAt: Date.now(),
            status: 'restarting',
          },
          updatedAt: Date.now(),
        },
        { merge: true },
      );

      await addDoc(restartCollectionRef, {
        requestedBy: currentUserId,
        createdAt: Date.now(),
        revision,
      });

      latestOfferRevision = revision;
      setConnectionTimeout();
    }
  };

  const otherCandidateCollection = role === 'tutor' ? studentCandidatesRef : tutorCandidatesRef;

  unsubscribers.push(
    onSnapshot(otherCandidateCollection, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type !== 'added') return;

        const candidate = hydrateCandidate(change.doc.data());
        const type = getCandidateType(candidate.candidate);
        discoveredCandidateTypes.add(type);
        if (type === 'relay') relayCandidateDiscovered = true;

        debugLog('webrtcService', 'Remote ICE candidate received.', {
          type,
          discoveredTypes: Array.from(discoveredCandidateTypes),
        });

        if (!pc.remoteDescription) {
          pendingRemoteCandidates.push(candidate);
          debugLog('webrtcService', 'Queued remote ICE candidate until remote description is ready.', {
            queuedCount: pendingRemoteCandidates.length,
          });
          return;
        }

        try {
          await pc.addIceCandidate(candidate);
        } catch (error) {
          debugLog('webrtcService', 'Failed to add remote ICE candidate.', {
            message: error.message,
          });
        }
      });
    }),
  );

  unsubscribers.push(
    onSnapshot(sessionRef, async (snapshot) => {
      const data = snapshot.data() || {};
      const webrtc = data.webrtc || {};

      if (typeof webrtc?.screenShare?.active === 'boolean' && role === 'student') {
        if (!webrtc.screenShare.active) {
          clearRemoteScreenStream();
        } else {
          emitScreenShareState();
        }
      }

      if (role === 'tutor') {
        const answerSdp = webrtc.answer?.sdp || null;

        debugLog('webrtcService', 'Tutor evaluating remote answer.', {
          hasAnswer: Boolean(webrtc.answer),
          hasCurrentRemoteDescription: Boolean(pc.currentRemoteDescription),
        });

        const shouldHandleAnswer =
          Boolean(webrtc.answer)
          && Boolean(answerSdp)
          && answerSdp !== latestAppliedAnswerSdp
          && pc.signalingState === 'have-local-offer';

        if (shouldHandleAnswer) {
          await pc.setRemoteDescription(new RTCSessionDescription(webrtc.answer));
          latestAppliedAnswerSdp = answerSdp;

          debugLog('webrtcService', 'Tutor applied remote answer.');

          await flushPendingRemoteCandidates();
          await setDoc(
            sessionRef,
            {
              webrtc: {
                status: 'connected',
              },
              updatedAt: Date.now(),
            },
            { merge: true },
          );
        }

        return;
      }

      const offerRevision = Number(webrtc.offerRevision || 0);
      if (!webrtc.offer) return;

      debugLog('webrtcService', 'Student evaluating remote offer.', {
        hasOffer: Boolean(webrtc.offer),
        offerRevision,
        latestOfferRevision,
        hasCurrentRemoteDescription: Boolean(pc.currentRemoteDescription),
      });

      const shouldHandleOffer = !pc.currentRemoteDescription || offerRevision > latestOfferRevision;
      if (!shouldHandleOffer) return;

      debugLog('webrtcService', '[parakleo:screen:student] offer handling.', {
        firestoreOfferRevision: offerRevision,
        latestHandledOfferRevision: latestOfferRevision,
      });
      latestOfferRevision = offerRevision;

      debugLog('webrtcService', '[parakleo:screen:student] setRemoteDescription start.', {
        offerRevision,
      });
      await pc.setRemoteDescription(new RTCSessionDescription(webrtc.offer));
      debugLog('webrtcService', '[parakleo:screen:student] setRemoteDescription success.', {
        offerRevision,
      });
      if (webrtc?.screenShare?.active === true) {
        attachRemoteScreenReceiverTrack();
      }
      debugLog('webrtcService', 'Student applied remote offer.', {
        offerRevision,
      });

      await flushPendingRemoteCandidates();

      debugLog('webrtcService', '[parakleo:screen:student] createAnswer start.', {
        offerRevision,
      });
      const answer = await pc.createAnswer();
      debugLog('webrtcService', '[parakleo:screen:student] createAnswer success.', {
        offerRevision,
      });
      await pc.setLocalDescription(answer);

      await setDoc(
        sessionRef,
        {
          webrtc: {
            answer: serializeSessionDescription(answer),
            studentReadyAt: Date.now(),
            status: 'connecting',
          },
          updatedAt: Date.now(),
        },
        { merge: true },
      );
      debugLog('webrtcService', '[parakleo:screen:student] answer written.', {
        offerRevision,
      });

      debugLog('webrtcService', 'Student created and saved answer.', {
        offerRevision,
      });

      setConnectionTimeout();
    }),
  );

  if (role === 'tutor') {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await clearCandidateCollection(getDocs, deleteDoc, tutorCandidatesRef);
    await clearCandidateCollection(getDocs, deleteDoc, studentCandidatesRef);

    await setDoc(
      sessionRef,
      {
        webrtc: {
          ready: true,
          status: 'tutor_waiting',
          offer: serializeSessionDescription(offer),
          answer: null,
          offerRevision: 1,
          tutorReadyAt: Date.now(),
          studentReadyAt: null,
          lastRestartAt: null,
          screenShare: {
            active: false,
            by: null,
            updatedAt: null,
          },
        },
        updatedAt: Date.now(),
      },
      { merge: true },
    );

    latestOfferRevision = 1;
  } else {
    await setDoc(
      sessionRef,
      {
        webrtc: {
          status: 'student_joining',
          studentReadyAt: Date.now(),
        },
        updatedAt: Date.now(),
      },
      { merge: true },
    );

    setConnectionTimeout();
  }

  const switchScreenTrack = async (nextTrack) => {
    const hasSender = Boolean(screenTransceiver?.sender);
    debugLog('webrtcService', '[parakleo:screen:tutor] switchScreenTrack.', {
      nextTrackState: nextTrack ? 'live' : 'null',
      hasSender,
      hasTransceiver: Boolean(screenTransceiver),
    });
    if (!screenTransceiver?.sender) return;
    await screenTransceiver.sender.replaceTrack(nextTrack);
    debugLog('webrtcService', '[parakleo:screen:tutor] switchScreenTrack replaceTrack success.', {
      nextTrackState: nextTrack ? 'live' : 'null',
    });
  };

  const stopScreenShare = async () => {
    debugLog('webrtcService', '[parakleo:screen:tutor] stopScreenShare start.', {
      hasActiveScreenStream: Boolean(activeScreenStream),
    });
    if (!activeScreenStream) return;

    const activeTrack = activeScreenStream.getVideoTracks()[0] || null;
    debugLog('webrtcService', '[parakleo:screen:tutor] stopScreenShare active track before stop.', {
      activeScreenTrackId: activeTrack?.id || null,
    });

    debugLog('webrtcService', '[parakleo:screen:tutor] stopScreenShare replaceTrack(null).');
    await switchScreenTrack(null);

    activeScreenStream.getTracks().forEach((track) => track.stop());
    activeScreenStream = null;

    await updateScreenShareDocState(false);

    isLocalScreenSharing = false;
    emitScreenShareState();
    await publishUpdatedOffer('connected');
    debugLog('webrtcService', 'Tutor stopped screen share.');
    onConnectionMessage?.('Screen sharing ended');
  };

  const startScreenShare = async () => {
    if (role !== 'tutor') {
      throw new Error('Only tutors can share screen.');
    }

    debugLog('webrtcService', '[parakleo:screen:tutor] startScreenShare getDisplayMedia start.');
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    debugLog('webrtcService', '[parakleo:screen:tutor] startScreenShare getDisplayMedia success.');

    const screenTrack = screenStream.getVideoTracks()[0];
    if (!screenTrack) {
      screenStream.getTracks().forEach((track) => track.stop());
      throw new Error('No screen track available.');
    }

    activeScreenStream = screenStream;

    debugLog('webrtcService', '[parakleo:screen:tutor] startScreenShare about to replace existing sender track.', {
      newTrackId: screenTrack.id,
      newTrackReadyState: screenTrack.readyState,
      senderHasTrack: Boolean(screenTransceiver?.sender?.track),
      existingSenderTrackId: screenTransceiver?.sender?.track?.id || null,
      existingSenderTrackReadyState: screenTransceiver?.sender?.track?.readyState || null,
    });

    await switchScreenTrack(screenTrack);
    await updateScreenShareDocState(true);

    debugLog('webrtcService', 'Tutor started screen share track.', {
      id: screenTrack.id,
      kind: screenTrack.kind,
      readyState: screenTrack.readyState,
      label: screenTrack.label || null,
    });
    debugLog('webrtcService', '[parakleo:screen:tutor] startScreenShare track details.', {
      id: screenTrack.id,
      kind: screenTrack.kind,
      readyState: screenTrack.readyState,
      label: screenTrack.label || null,
    });

    isLocalScreenSharing = true;
    emitScreenShareState();
    await publishUpdatedOffer('screen_sharing');
    onConnectionMessage?.('Screen sharing started');

    screenTrack.addEventListener('ended', async () => {
      await stopScreenShare();
    });
  };

  const toggleAudio = () => {
    const track = localStream.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return track.enabled;
  };

  const toggleVideo = () => false;

  const close = async () => {
    if (isClosed) return;
    isClosed = true;

    if (connectTimer) clearTimeout(connectTimer);

    unsubscribers.forEach((unsub) => unsub());

    if (activeScreenStream) {
      activeScreenStream.getTracks().forEach((track) => track.stop());
    }

    clearRemoteScreenStream();
    localStream.getTracks().forEach((track) => track.stop());

    pc.getSenders().forEach((sender) => {
      sender.track?.stop?.();
    });

    pc.close();
  };

  return {
    localStream,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    close,
  };
}

export function getDefaultIceServers() {
  return DEFAULT_ICE_SERVERS;
}
