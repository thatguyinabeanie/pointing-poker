import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import type { Theme } from "@mui/material/styles";
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
    // Between lg and xl the bar's right cell is narrow (221px at a 1200px layout) and the
    // revealed actions need 272px with the Save spinner. A 4px gap and tighter card padding
    // shrink the deck there so the two side cells grow; from xl up there is room to spare.
    <Stack
      direction="row"
      useFlexGap
      spacing={{ xs: 1, lg: 0.5, xl: 1 }}
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

// Side padding drops to 8px between lg and xl (see Deck), so "0.5", "13", "21" and "☕" shrink
// to the 48px minimum like the other cards. Module level so the sx is not rebuilt per render.
const CARD_SX = (theme: Theme) => ({
  minWidth: 48,
  height: 64,
  fontSize: 20,
  transition: "transform 120ms",
  [theme.breakpoints.between("lg", "xl")]: { px: 1 },
});

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
      sx={[CARD_SX, { transform: isSelected ? "translateY(-4px)" : "none" }]}
    >
      {card}
    </Button>
  );
}
