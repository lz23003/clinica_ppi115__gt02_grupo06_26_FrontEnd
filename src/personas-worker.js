const normalize = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/\p{Diacritic}/gu, '')
  .toLocaleLowerCase('es');

self.addEventListener('message', ({ data }) => {
  const query = normalize(data.query).trim();
  const results = data.personas
    .filter((persona) => normalize(`${persona.nombres ?? ''} ${persona.apellidos ?? ''}`).includes(query))
    .sort((left, right) => normalize(left.apellidos).localeCompare(normalize(right.apellidos), 'es'));

  self.postMessage({ requestId: data.requestId, results });
});
