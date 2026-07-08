package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCopyOptionalFileCopiesWhenPresent(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "terrain-colors.png")
	dst := filepath.Join(dir, "out", "terrain-colors.png")

	if err := os.WriteFile(src, []byte{1, 2, 3}, 0644); err != nil {
		t.Fatal(err)
	}

	copied, err := copyOptionalFile(src, dst)
	if err != nil {
		t.Fatal(err)
	}
	if !copied {
		t.Fatal("expected file to be copied")
	}

	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string([]byte{1, 2, 3}) {
		t.Fatalf("copied bytes = %v", got)
	}
}

func TestCopyOptionalFileIgnoresMissingSource(t *testing.T) {
	dir := t.TempDir()

	copied, err := copyOptionalFile(
		filepath.Join(dir, "missing.png"),
		filepath.Join(dir, "out", "terrain-colors.png"),
	)
	if err != nil {
		t.Fatal(err)
	}
	if copied {
		t.Fatal("expected missing file not to be copied")
	}
}

func TestCopyOptionalSizedFileCopiesOnExactSize(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "layers.bin")
	dst := filepath.Join(dir, "out", "layers.bin")
	payload := []byte{9, 8, 7, 6, 5}

	if err := os.WriteFile(src, payload, 0644); err != nil {
		t.Fatal(err)
	}

	copied, err := copyOptionalSizedFile(src, dst, len(payload))
	if err != nil {
		t.Fatal(err)
	}
	if !copied {
		t.Fatal("expected file to be copied")
	}
	got, err := os.ReadFile(dst)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != string(payload) {
		t.Fatalf("copied bytes = %v", got)
	}
}

func TestCopyOptionalSizedFileSkipsWrongSize(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "layers.bin")
	dst := filepath.Join(dir, "out", "layers.bin")

	if err := os.WriteFile(src, []byte{1, 2, 3}, 0644); err != nil {
		t.Fatal(err)
	}

	copied, err := copyOptionalSizedFile(src, dst, 999)
	if err != nil {
		t.Fatal(err)
	}
	if copied {
		t.Fatal("expected wrong-size file not to be copied")
	}
	if _, err := os.Stat(dst); !os.IsNotExist(err) {
		t.Fatal("expected no output file for wrong-size sidecar")
	}
}

func TestCopyOptionalSizedFileIgnoresMissingSource(t *testing.T) {
	dir := t.TempDir()

	copied, err := copyOptionalSizedFile(
		filepath.Join(dir, "missing.bin"),
		filepath.Join(dir, "out", "layers.bin"),
		10,
	)
	if err != nil {
		t.Fatal(err)
	}
	if copied {
		t.Fatal("expected missing file not to be copied")
	}
}
