import os
import json
import tempfile
from flask import Flask, render_template, request, jsonify
from google import genai
from google.genai import types
from dotenv import load_dotenv
from pptx import Presentation

# Load the vault
load_dotenv()

app = Flask(__name__)

# Initialize the engine
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

@app.route('/')
def index():
    return render_template('index.html')

# New Tool: Crack open the PPTX and pull out the raw text
def extract_text_from_pptx(file_path):
    prs = Presentation(file_path)
    text_content = []
    for slide in prs.slides:
        for shape in slide.shapes:
            if hasattr(shape, "text"):
                text_content.append(shape.text)
    return "\n".join(text_content)

@app.route('/generate', methods=['POST'])
def generate_quiz():
    if 'document' not in request.files:
        return jsonify({'error': 'No document uploaded'}), 400
        
    file = request.files['document']
    difficulty = request.form.get('difficulty', 'medium')
    num_questions = request.form.get('num_questions', 10)
    mode = request.form.get('mode', 'quiz') # <-- Catches the hidden mode switch

    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    file_ext = os.path.splitext(file.filename)[1].lower()
    
    # Save the file temporarily
    with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
        file.save(temp_file.name)
        temp_file_path = temp_file.name

    try:
        # THE FORK IN THE ROAD
        if mode == 'flashcard':
            prompt = f"""
            You are an expert tutor. I will provide a document.
            Create exactly {num_questions} flashcards from this text.
            The difficulty level should be {difficulty}.
            
            You MUST respond ONLY with a valid JSON object. Do not include markdown formatting.
            The JSON object must contain a single key called "quiz" which holds an array of flashcard objects.
            
            Each object in the array MUST have exactly these two keys:
            - "term": "The key concept or vocabulary word"
            - "definition": "A clear, concise definition or explanation"
            """
        else:
            prompt = f"""
            You are an expert university professor. I am providing lecture material.
            Generate exactly {num_questions} multiple-choice questions from this material.
            The intelligence/difficulty level should be: {difficulty}.
            
            You must respond ONLY with a valid JSON object. Do not include markdown formatting or extra text.
            The JSON object must contain a single key called "quiz" which holds an array of question objects.
            
            Each object in the array MUST have exactly these four keys:
            - "question": The actual question text.
            - "options": An array of exactly 4 possible answers.
            - "answer": The exact string of the correct option (must perfectly match one of the options).
            - "explanation": A clear, 1-2 sentence explanation of why this answer is correct. Do not skip this.
            """
        
        contents = [prompt]
        gemini_file = None
        
        # Logic Fork: Handle PPTX locally, handle PDF via Gemini API
        if file_ext == '.pptx':
            pptx_text = extract_text_from_pptx(temp_file_path)
            contents.append(f"Here is the lecture text:\n\n{pptx_text}")
        else:
            gemini_file = client.files.upload(file=temp_file_path)
            contents.append(gemini_file)

        # Call the engine
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=contents,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        
        quiz_data = json.loads(response.text)
        
        # Clean up the cloud vault if it was a PDF
        if gemini_file:
            client.files.delete(name=gemini_file.name)
            
        return jsonify(quiz_data)
        
    except Exception as e:
        print(f"Error generating content: {e}")
        return jsonify({'error': 'The engine failed to process this document. It may be too large or complex.'}), 500
        
    finally:
        # Always delete the temporary file off your hard drive
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

if __name__ == '__main__':
    app.run(debug=True)