import os
import json
import tempfile
from flask import Flask, render_template, request, jsonify
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load the vault
load_dotenv()

app = Flask(__name__)

# Initialize the engine
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/generate', methods=['POST'])
def generate_quiz():
    # 1. Check if a file was actually uploaded
    if 'document' not in request.files:
        return jsonify({'error': 'No document uploaded'}), 400
        
    file = request.files['document']
    difficulty = request.form.get('difficulty', 'medium')
    num_questions = request.form.get('num_questions', 10)

    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    # 2. Save the file temporarily so the AI can read it
    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(file.filename)[1]) as temp_file:
        file.save(temp_file.name)
        temp_file_path = temp_file.name

    try:
        # 3. Upload the document to Gemini
        gemini_file = client.files.upload(file=temp_file_path)
        
        # 4. The Master Prompt - Forcing the strict JSON structure
        prompt = f"""
        You are an expert university professor. I am providing a lecture document.
        Generate exactly {num_questions} multiple-choice questions from this document.
        The intelligence/difficulty level should be: {difficulty}.
        
        You must respond ONLY with a valid JSON object. Do not include markdown formatting or extra text.
        The JSON object must contain a single key called "quiz" which holds an array of question objects.
        
        Each object in the array MUST have exactly these four keys:
        - "question": The actual question text.
        - "options": An array of exactly 4 possible answers.
        - "answer": The exact string of the correct option (must perfectly match one of the options).
        - "explanation": A clear, 1-2 sentence explanation of why this answer is correct. Do not skip this.
        """
        
        # 5. Call the engine and force a JSON response
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[gemini_file, prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        
        # 6. Parse the data and clean up the server
        quiz_data = json.loads(response.text)
        client.files.delete(name=gemini_file.name)
        
        return jsonify(quiz_data)
        
    except Exception as e:
        print(f"Error generating quiz: {e}")
        return jsonify({'error': 'The engine failed to process this document. Please try again.'}), 500
        
    finally:
        # Always delete the temporary file off your hard drive
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

if __name__ == '__main__':
    app.run(debug=True)