import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../../theme/colors';

function escapeAttribute(value = '') {
  return String(value || '').replace(/"/g, '&quot;');
}

function buildPickerHtml({ accept, capture, title }) {
  const acceptValue = escapeAttribute(accept);
  const captureAttribute = capture ? `capture="${escapeAttribute(capture)}"` : '';
  const heading = String(title || 'Choose files');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <style>
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: #f8fafc;
        color: #18181b;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
      .card {
        width: min(92vw, 420px);
        background: #ffffff;
        border: 1px solid #e4e4e7;
        border-radius: 24px;
        padding: 24px;
        box-sizing: border-box;
        box-shadow: 0 24px 70px rgba(15, 23, 42, 0.12);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        margin: 0 0 20px;
        color: #71717a;
        line-height: 1.5;
      }
      button {
        width: 100%;
        border: 0;
        border-radius: 16px;
        padding: 14px 16px;
        font-weight: 700;
        font-size: 15px;
        cursor: pointer;
        margin-bottom: 12px;
      }
      .primary {
        background: #10b981;
        color: #ffffff;
      }
      .secondary {
        background: #f4f4f5;
        color: #18181b;
      }
      #fileInput {
        display: none;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>${heading}</h1>
      <p>Select image or PDF files. Large files can take longer to process on mobile.</p>
      <input id="fileInput" type="file" accept="${acceptValue}" ${captureAttribute} multiple />
      <button class="primary" id="openPicker">Choose file</button>
      <button class="secondary" id="cancelPicker">Cancel</button>
    </div>
    <script>
      const input = document.getElementById('fileInput');
      const post = (payload) => window.ReactNativeWebView.postMessage(JSON.stringify(payload));

      const readFile = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({
          name: file.name,
          type: file.type,
          size: file.size,
          lastModified: file.lastModified,
          dataUrl: String(reader.result || ''),
        });
        reader.onerror = () => reject(new Error('Unable to read selected file.'));
        reader.readAsDataURL(file);
      });

      input.addEventListener('change', async () => {
        const files = Array.from(input.files || []);
        if (!files.length) {
          post({ type: 'cancel' });
          return;
        }

        try {
          const serialized = [];
          for (const file of files) {
            serialized.push(await readFile(file));
          }
          post({ type: 'files_selected', files: serialized });
        } catch (error) {
          post({ type: 'error', message: error.message || 'Unable to read selected files.' });
        }
      });

      document.getElementById('openPicker').addEventListener('click', () => input.click());
      document.getElementById('cancelPicker').addEventListener('click', () => post({ type: 'cancel' }));
      window.addEventListener('load', () => setTimeout(() => input.click(), 250));
    </script>
  </body>
</html>`;
}

export function AttachmentPickerModal({
  visible,
  mode,
  onCancel,
  onError,
  onFilesSelected,
}) {
  const isCamera = mode === 'camera';
  const html = buildPickerHtml({
    accept: isCamera ? 'image/*' : 'image/*,application/pdf',
    capture: isCamera ? 'environment' : '',
    title: isCamera ? 'Take Picture' : 'Upload files',
  });

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" style={styles.scrim} onPress={onCancel} />
        <View style={styles.sheet}>
          <Text style={styles.title}>{isCamera ? 'Take Picture' : 'Upload files'}</Text>
          <Text style={styles.copy}>The mobile app uses a secure file chooser bridge to match the web upload flow.</Text>
          <View style={styles.webviewWrap}>
            <WebView
              originWhitelist={['*']}
              source={{ html }}
              onMessage={(event) => {
                try {
                  const payload = JSON.parse(event.nativeEvent.data || '{}');
                  if (payload.type === 'cancel') {
                    onCancel?.();
                    return;
                  }
                  if (payload.type === 'error') {
                    onError?.(payload.message || 'Unable to read the selected file.');
                    return;
                  }
                  if (payload.type === 'files_selected') {
                    onFilesSelected?.(Array.isArray(payload.files) ? payload.files : []);
                  }
                } catch (error) {
                  onError?.('Unable to read the selected file.');
                }
              }}
            />
          </View>
          <Pressable accessibilityRole="button" style={styles.closeButton} onPress={onCancel}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.2)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 10,
    maxHeight: '85%',
    padding: 16,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  webviewWrap: {
    borderColor: colors.border,
    borderRadius: 20,
    borderWidth: 1,
    height: 360,
    overflow: 'hidden',
  },
  closeButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: 'center',
  },
  closeText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
});
