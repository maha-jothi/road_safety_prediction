import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
import pickle
import os

def train_and_save_model():
    current_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(current_dir, 'accidents.csv')
    model_path = os.path.join(current_dir, 'model.pkl')

    if not os.path.exists(csv_path):
        print("Dataset not found. Please run data_generator.py first.")
        return

    df = pd.read_csv(csv_path)
    X = df[['latitude', 'longitude', 'weather']]
    y = df['risk']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    
    acc = model.score(X_test, y_test)
    print(f"Model trained with accuracy {acc:.2f}")

    with open(model_path, 'wb') as f:
        pickle.dump(model, f)
    
    print(f"Model saved to {model_path}")

if __name__ == "__main__":
    train_and_save_model()
