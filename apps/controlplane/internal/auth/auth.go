package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
)

var ErrInvalidKey = errors.New("invalid API key")

type KeyStore interface {
	GetTenantByKeyHash(ctx context.Context, keyHash string) (string, error)
}

type Auth struct {
	store KeyStore
}

func New(store KeyStore) *Auth {
	return &Auth{store: store}
}

func HashKey(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

func (a *Auth) Validate(ctx context.Context, rawKey string) (string, error) {
	hash := HashKey(rawKey)
	tenantID, err := a.store.GetTenantByKeyHash(ctx, hash)
	if err != nil {
		return "", err
	}
	if tenantID == "" {
		return "", ErrInvalidKey
	}
	return tenantID, nil
}
