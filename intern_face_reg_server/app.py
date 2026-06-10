import base64
import cv2
import numpy as np
from flask import Flask, request, jsonify
from insightface.app import FaceAnalysis
import os

app = Flask(__name__)

# Use buffalo_sc (MobileFaceNet) — same model as HRIS-APP and HRIS-KIOSK clients
home_dir = os.path.expanduser('~')
insightface_root = os.path.join(home_dir, '.insightface')

face_app = FaceAnalysis(name='buffalo_sc', root=insightface_root)
face_app.prepare(ctx_id=-1, det_size=(640, 640))

@app.route('/embed', methods=['POST'])
def get_embeddings():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'ok': False, 'error': 'Missing request data'}), 400

        # Accept both 'images' (admin IMS) and 'photos' (intern registration portal)
        images_base64 = data.get('images') or data.get('photos')
        if not images_base64 or not isinstance(images_base64, list) or len(images_base64) != 5:
            return jsonify({'success': False, 'ok': False, 'error': 'Exactly 5 images/photos are required'}), 400

        embeddings = []
        for idx, img_b64 in enumerate(images_base64):
            # Strip data URI header if present
            if ',' in img_b64:
                img_b64 = img_b64.split(',')[1]

            try:
                img_data = base64.b64decode(img_b64)
            except Exception:
                return jsonify({'success': False, 'ok': False, 'error': f'Image {idx+1} has invalid base64 encoding'}), 400

            nparr = np.frombuffer(img_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                return jsonify({'success': False, 'ok': False, 'error': f'Image {idx+1} could not be decoded'}), 400

            faces = face_app.get(img)

            if not faces:
                return jsonify({'success': False, 'ok': False, 'error': f'No face detected in image {idx+1}. Ensure face is clear and well-lit.'}), 400

            if len(faces) > 1:
                return jsonify({'success': False, 'ok': False, 'error': f'Multiple faces detected in image {idx+1}. Keep only one person in frame.'}), 400

            embedding = faces[0].embedding.tolist()
            embeddings.append(embedding)

        return jsonify({'success': True, 'ok': True, 'embeddings': embeddings})

    except Exception as e:
        return jsonify({'success': False, 'ok': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001)
