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
