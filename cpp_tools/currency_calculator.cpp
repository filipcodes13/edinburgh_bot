#include <iostream>
#include <string>
#include "json.hpp"

using json = nlohmann::json;

int main() {
    double amount;
    std::string from_currency, to_currency;
    std::string json_rates_str;
    std::string line;

    std::cin >> amount >> from_currency >> to_currency;

    std::getline(std::cin, line); // Wyczyść bufor
    std::getline(std::cin, json_rates_str);

    try {
        auto rates_data = json::parse(json_rates_str);
        if (rates_data.find(from_currency) == rates_data.end() || rates_data.find(to_currency) == rates_data.end()) {
             std::cerr << "Error: Could not find rates for specified currencies.";
             return 1;
        }
        double from_rate = rates_data[from_currency];
        double to_rate = rates_data[to_currency];

        double result = (amount / from_rate) * to_rate;
        std::cout << result;
    } catch (json::parse_error& e) {
        std::cerr << "Error: Invalid JSON format. " << e.what();
        return 1;
    }

    return 0;
}