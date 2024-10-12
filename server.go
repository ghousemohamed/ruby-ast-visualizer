package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
)

func enableCors(w *http.ResponseWriter) {
	(*w).Header().Set("Access-Control-Allow-Origin", "*")
	(*w).Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	(*w).Header().Set("Access-Control-Allow-Headers", "Content-Type")
}

func handleParse(w http.ResponseWriter, r *http.Request) {
	enableCors(&w)

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	tmpfile, err := os.CreateTemp("", "code-*.rb")
	if err != nil {
		http.Error(w, "Failed to create temporary file", http.StatusInternalServerError)
		return
	}
	defer os.Remove(tmpfile.Name())

	if _, err := tmpfile.Write([]byte(req.Code)); err != nil {
		http.Error(w, "Failed to write to temporary file", http.StatusInternalServerError)
		return
	}
	if err := tmpfile.Close(); err != nil {
		http.Error(w, "Failed to close temporary file", http.StatusInternalServerError)
		return
	}

	cmd := exec.Command("stree", "json", tmpfile.Name())
	output, err := cmd.Output()
	if err != nil {
		http.Error(w, "Failed to execute stree command", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")

	if _, err := io.WriteString(w, string(output)); err != nil {
		log.Printf("Error writing response: %v", err)
	}
}

func main() {
	http.HandleFunc("/parse", handleParse)
	log.Println("Server starting on :4000")
	log.Fatal(http.ListenAndServe(":4000", nil))
}