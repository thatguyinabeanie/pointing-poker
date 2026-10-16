import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useCallback } from "react";

interface Props {
  deck: readonly string[];
  selected: string | null;
  disabled: boolean;
  onSelect: (card: string) => void;
  onClear: () => void;
}

export function Deck({ deck, selected, disabled, onSelect, onClear }: Props) {
  return (
    <Stack
      direction="row"
      useFlexGap
      spacing={1}
      sx={{ flexWrap: "wrap" }}
      role="group"
      aria-label="Voting cards"
    >
      {deck.map((card) => (
        <DeckCard
          key={card}
          card={card}
          isSelected={card === selected}
          disabled={disabled}
          onSelect={onSelect}
          onClear={onClear}
        />
      ))}
    </Stack>
  );
}

interface CardProps {
  card: string;
  isSelected: boolean;
  disabled: boolean;
  onSelect: (card: string) => void;
  onClear: () => void;
}

function DeckCard({ card, isSelected, disabled, onSelect, onClear }: CardProps) {
  // Toggle semantics match the server: voting the same card again clears it.
  const onClick = useCallback(() => {
    if (isSelected) onClear();
    else onSelect(card);
  }, [isSelected, onClear, onSelect, card]);
  return (
    <Button
      variant={isSelected ? "contained" : "outlined"}
      aria-pressed={isSelected}
      disabled={disabled}
      onClick={onClick}
      // Lift is on the button, not the group, so the focus ring travels with the card.
      sx={{
        minWidth: 48,
        height: 64,
        fontSize: 20,
        transition: "transform 120ms",
        transform: isSelected ? "translateY(-4px)" : "none",
      }}
    >
      {card}
    </Button>
  );
}
