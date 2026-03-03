import React, { useState, useRef } from 'react';

interface Props {
  id: string;
  value: string;
  onChange: (val: string) => void;
  required?: boolean;
}

export default function TimeInput({ id, value, onChange, required }: Props) {
  const [display, setDisplay] = useState(value);
  const [valid, setValid] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep display in sync if parent resets value (e.g. after form submit)
  React.useEffect(() => {
    setDisplay(value);
    if (value === '') setValid(true);
  }, [value]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    let raw = e.target.value.replace(/\D/g, '');
    if (raw.length > 4) raw = raw.slice(0, 4);

    let formatted = raw;
    if (raw.length >= 3) {
      formatted = raw.slice(0, 2) + ':' + raw.slice(2);
    }

    setDisplay(formatted);

    if (raw.length === 4) {
      const h = parseInt(raw.slice(0, 2));
      const m = parseInt(raw.slice(2, 4));
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        setValid(true);
        onChange(formatted);
      } else {
        setValid(false);
        onChange('');
      }
    } else {
      setValid(true);
      onChange('');
    }
  }

  function handleFocus() {
    inputRef.current?.select();
  }

  function handleBlur() {
    if (display && display.replace(/\D/g, '').length < 4) {
      setValid(false);
    }
  }

  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      maxLength={5}
      placeholder="HH:MM"
      className={`time-input${!valid ? ' input-error' : ''}`}
      value={display}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      required={required}
      autoComplete="off"
    />
  );
}
