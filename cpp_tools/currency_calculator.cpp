#include <iostream>
#include <string>
#include <sstream>
#include <vector>

double getValueFromJson(const std::string& json, const std::string& key) {
    std::string search_key = "\"" + key + "\":";
    size_t pos = json.find(search_key);
    if (pos == std::string::npos) return 0.0;

    pos += search_key.length();
    size_t end_pos = json.find_first_of(",}", pos);
    std::string value_str = json.substr(pos, end_pos - pos);
    
    try {
        return std::stod(value_str);
    } catch (...) {
        return 0.0;
    }
}

int main() {
    double amount;
    std::string from_currency, to_currency;
    std::string json_rates_str;
    std::string line;

    std::cin >> amount >> from_currency >> to_currency;
    
    std::getline(std::cin, line); // Wyczyść bufor
    std::getline(std::cin, json_rates_str);

    double from_rate = getValueFromJson(json_rates_str, from_currency);
    double to_rate = getValueFromJson(json_rates_str, to_currency);

    if (from_rate > 0 && to_rate > 0) {
        double result = (amount / from_rate) * to_rate;
        std::cout << result;
    } else {
        std::cerr << "Error: Could not find rates for specified currencies.";
        return 1;
    }

    return 0;
}