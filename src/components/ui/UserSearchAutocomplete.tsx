import React, { useState, useRef, useEffect } from "react";
import useSWR from "swr";
import { Input } from "@/components/ui/Input";

export interface UserSuggestion {
  sub: string;
  displayName: string;
  email: string;
}

interface UserSearchAutocompleteProps {
  label?: string;
  placeholder?: string;
  onSelect: (user: UserSuggestion | null) => void;
  error?: string;
  defaultValue?: string;
}

export function UserSearchAutocomplete({ label, placeholder, onSelect, error, defaultValue }: UserSearchAutocompleteProps) {
  const [query, setQuery] = useState(defaultValue || "");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(handler);
  }, [query]);

  const { data: results, isLoading } = useSWR<UserSuggestion[]>(
    debouncedQuery.length >= 2 ? `/api/users/search?q=${encodeURIComponent(debouncedQuery)}` : null,
    (url: string) => fetch(url).then(res => res.json())
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);
    if (!val) {
      onSelect(null);
    }
  };

  const handleSelect = (user: UserSuggestion) => {
    setQuery(`${user.displayName} (${user.email})`);
    setIsOpen(false);
    onSelect(user);
  };

  return (
    <div className="autocomplete-wrapper" ref={wrapperRef} style={{ position: "relative", zIndex: 50 }}>
      <Input
        label={label}
        placeholder={placeholder}
        value={query}
        onChange={handleChange}
        onFocus={() => setIsOpen(true)}
        error={error}
        autoComplete="off"
      />
      {isOpen && (query.length >= 2) && (
        <ul className="autocomplete-dropdown" style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 9999,
          backgroundColor: "var(--color-surface, #ffffff)", border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)", maxHeight: "200px", overflowY: "auto",
          listStyle: "none", padding: "0.5rem", margin: "0.25rem 0 0 0",
          boxShadow: "var(--shadow-md)"
        }}>
          {isLoading ? (
            <li style={{ padding: "0.5rem", color: "var(--color-text-muted)", fontSize: "0.9rem" }}>Recherche en cours...</li>
          ) : results && results.length > 0 ? (
            results.map((u, i) => (
              <li
                key={i}
                onClick={() => handleSelect(u)}
                style={{
                  padding: "0.5rem", cursor: "pointer", borderRadius: "var(--radius-sm)",
                  display: "flex", flexDirection: "column"
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-background, #f5f5f5)"}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <span style={{ fontWeight: 500 }}>{u.displayName}</span>
                <span style={{ fontSize: "0.8rem", color: "var(--color-text-muted)" }}>{u.email}</span>
              </li>
            ))
          ) : (
            <li style={{ padding: "0.5rem", color: "var(--color-text-muted)", fontSize: "0.9rem" }}>Aucun utilisateur trouvé</li>
          )}
        </ul>
      )}
    </div>
  );
}
