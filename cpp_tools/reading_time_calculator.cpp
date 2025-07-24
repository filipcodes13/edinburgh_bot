#include <iostream>
#include <string>
#include <sstream>
#include <vector>
#include <cmath>

int main() {
    // Wczytaj cały tekst podany na standardowe wejście
    std::string text, line;
    while (std::getline(std::cin, line)) {
        text += line + " ";
    }

    // Policz słowa w tekście
    std::stringstream stream(text);
    std::string word;
    int word_count = 0;
    while (stream >> word) {
        word_count++;
    }

    // Oblicz czas czytania (przyjmujemy średnio 200 słów na minutę)
    const double WORDS_PER_MINUTE = 200.0;
    if (word_count > 0) {
        double minutes = static_cast<double>(word_count) / WORDS_PER_MINUTE;
        // Zaokrąglij w górę do najbliższej minuty, minimum 1
        int reading_time = static_cast<int>(std::ceil(minutes));
        if (reading_time < 1) {
            reading_time = 1;
        }
        // Zwróć wynik
        std::cout << reading_time;
    } else {
        std::cout << 0;
    }

    return 0;
}
