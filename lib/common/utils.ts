export function escapeRegExp(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hashCode(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}


export function graal_tokenize(string: string, sep = ' ') {
	let separator = sep[0];
	let insideQuote = false;
	let stringList = [];
	let currentString = "";

	let stringLength = string.length;
	for (let i = 0; i < stringLength; i++) {
		switch (string[i]) {
			case separator: {
				if (!insideQuote) {
					stringList.push(currentString);
					currentString = "";
				}
				else currentString += string[i];

				break;
			}

			case '\"': {
				insideQuote = !insideQuote;
				break;
			}

			case '\\': {
				if (i + 1 < stringLength) {
					switch (string[i+1]) {
						case '"':
						case '\\':
							i++;

						default:
							currentString += string[i];
							break;
					}
				}
				else currentString += string[i];
				break;
			}

			default: {
				currentString += string[i];
				break;
			}
		}
	}
	
	stringList.push(currentString);
	return stringList;
}

/**
 * Takes a string as input, and returns an escaped string replacing new lines
 * with commas and escaping slashes, and quotes
 * 
 * @param buffer 
 * @returns 
 */
export function gtokenize(buffer: string) : string {
	let output = "";
	
	// Remove carriage return characters from the string
	buffer = buffer.replace(/\r/g, "");
	
	// Split the buffer by newlines, keeping empty values as well
	const elements = buffer.split('\n', -1);
	
	for (let el of elements) {
		if (el.length > 0) {
			let complex = false;
			for (const ch of el) {
				if (ch < '!' || ch > '~' || ch == ',' || ch == '/') {
					complex = true;
					break;
				}
			}

			if (el.trim().length == 0) {
				complex = true;
			}

			if (complex) {
				el = el.replace(/\\/g, "\\\\");
				el = el.replace(/\"/g, "\"\"");
				output += "\"" + el + "\",";
			}
			else output += el + ",";
		}
		else output += ",";
	}

	return output.slice(0, -1);
}

export function guntokenize(buffer: string) : string {
	let output = "";
	let is_paren = false;

	// Check to see if we are starting with a quotation mark.
	let i = 0;
	if (buffer[0] == '"')
	{
		is_paren = true;
		++i;
	}

	// Untokenize.
	for (; i < buffer.length; ++i)
	{
		// If we encounter a comma not inside a quoted string, we are encountering
		// a new index.  Replace the comma with a newline.
		if (buffer[i] == ',' && !is_paren)
		{
			output += '\n';

			// Ignore whitespace.
			while (i + 1 < buffer.length && buffer[i + 1] == ' ')
				++i;

			// Check to see if the next string is quoted.
			if (i + 1 < buffer.length && buffer[i + 1] == '"')
			{
				is_paren = true;
				++i;
			}
		}
		// We need to handle quotation marks as they have different behavior in quoted strings.
		else if (buffer[i] == '"')
		{
			// If we are encountering a quotation mark in a quoted string, we are either
			// ending the quoted string or escaping a quotation mark.
			if (is_paren)
			{
				if (i + 1 < buffer.length)
				{
					// Escaping a quotation mark.
					if (buffer[i + 1] == '"')
					{
						output += "\"";
						++i;
					}
					// Ending the quoted string.
					else if (buffer[i + 1] == ',')
						is_paren = false;
				}
			}
			// A quotation mark in a non-quoted string.
			else output += buffer[i];
		}
		// Unescape '\' character
		else if (buffer[i] == '\\')
		{
			if (i + 1 < buffer.length && buffer[i + 1] == '\\')
			{
				output += "\\";
				i++;
			}
		}
		// Anything else gets put to the output.
		else output += buffer[i];
	}
	
	return output;
}

export function gCommaStrTokens(buffer: string) {
	let retData: string[] = []

	// CString line;
	let line: string = ""
	let is_paren = false;

	// // Check to see if we are starting with a quotation mark.
	let i = 0;
	if (buffer[0] == '"')
	{
		is_paren = true;
		++i;
	}

	// // Untokenize.
	for (; i < buffer.length; ++i)
	{
		// If we encounter a comma not inside a quoted string, we are encountering
		// a new index.  Replace the comma with a newline.
		if (buffer[i] == ',' && !is_paren)
		{
			retData.push(line);
			line = "";

			// Ignore whitespace.
			while (i + 1 < buffer.length && buffer[i + 1] == ' ')
				++i;

			// Check to see if the next string is quoted.
			if (i + 1 < buffer.length && buffer[i + 1] == '"')
			{
				is_paren = true;
				++i;
			}
		}
		// We need to handle quotation marks as they have different behavior in quoted strings.
		else if (buffer[i] == '"')
		{
			// If we are encountering a quotation mark in a quoted string, we are either
			// ending the quoted string or escaping a quotation mark.
			if (is_paren)
			{
				if (i + 1 < buffer.length)
				{
					// Escaping a quotation mark.
					if (buffer[i + 1] == '"')
					{
						line += "\"";
						++i;
					}
					// Ending the quoted string.
					else if (buffer[i + 1] == ',')
						is_paren = false;
				}
			}
			// A quotation mark in a non-quoted string.
			else line += buffer[i];
		}
		// Unescape '\' character
		else if (buffer[i] == '\\')
		{
			if (i + 1 < buffer.length)
			{
				if (buffer[i + 1] == '\\')
				{
					line += "\\";
					i++;
				}
			}
		}
		// Anything else gets put to the output.
		else line += buffer[i];
	}

	if (is_paren || line.length > 0)
		retData.push(line);
	return retData;
}
