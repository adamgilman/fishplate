package auth

import (
	"context"
	"errors"
	"testing"
)

type mockKeyStore struct {
	keys map[string]string // keyHash -> tenantID
}

func (m *mockKeyStore) GetTenantByKeyHash(_ context.Context, keyHash string) (string, error) {
	tid, ok := m.keys[keyHash]
	if !ok {
		return "", nil
	}
	return tid, nil
}

func TestValidKey(t *testing.T) {
	rawKey := "fp_test_key_12345"
	hash := HashKey(rawKey)

	store := &mockKeyStore{
		keys: map[string]string{
			hash: "tenant-abc",
		},
	}
	a := New(store)

	tenantID, err := a.Validate(context.Background(), rawKey)
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if tenantID != "tenant-abc" {
		t.Errorf("expected tenant-abc, got %s", tenantID)
	}
}

func TestInvalidKey(t *testing.T) {
	store := &mockKeyStore{
		keys: map[string]string{},
	}
	a := New(store)

	_, err := a.Validate(context.Background(), "bad-key")
	if !errors.Is(err, ErrInvalidKey) {
		t.Errorf("expected ErrInvalidKey, got %v", err)
	}
}
